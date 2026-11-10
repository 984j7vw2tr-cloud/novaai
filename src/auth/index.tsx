/**
 * ログインの仕組み（メール＋パスワード / メールのリンク / Google / Apple）。
 * ログイン状態を画面全体に配り、ログイン・登録・ログアウトの操作をまとめる。
 */
import type { AuthError, Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { isDemoMode, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

// Webでログイン画面（Google等）から戻ってきたときに、開いた画面を閉じる
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'apple';

/** 画面に出すエラーの種類（文言は言語ファイルで決める） */
export type AuthErrorKind =
  | 'invalid'
  | 'notConfirmed'
  | 'exists'
  | 'weakPassword'
  | 'email'
  | 'rateLimit'
  | 'provider'
  | 'generic';

export class AuthFailure extends Error {
  readonly kind: AuthErrorKind;
  constructor(kind: AuthErrorKind) {
    super(kind);
    this.name = 'AuthFailure';
    this.kind = kind;
  }
}

/** Supabaseのエラーを、画面に出す種類に分ける */
export function classifyAuthError(error: AuthError | Error | null | undefined): AuthErrorKind {
  const code = (error as AuthError | undefined)?.code ?? '';
  const status = (error as AuthError | undefined)?.status;
  const msg = (error?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'invalid';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'notConfirmed';
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    msg.includes('already registered')
  )
    return 'exists';
  if (code === 'weak_password' || msg.includes('password should be')) return 'weakPassword';
  if (
    code === 'email_address_invalid' ||
    code === 'validation_failed' ||
    msg.includes('invalid email')
  )
    return 'email';
  if (status === 429 || code.includes('rate_limit') || msg.includes('rate limit'))
    return 'rateLimit';
  if (code === 'provider_disabled' || msg.includes('provider is not enabled')) return 'provider';
  return 'generic';
}

/** ログイン後に戻ってくる場所（Web：このサイトの /auth/callback、スマホ：novaai://auth/callback） */
export function authRedirectUrl() {
  return makeRedirectUri({ scheme: 'novaai', path: 'auth/callback' });
}

/** 戻ってきたURLの ?code=... を使ってログインを完了する（スマホ用） */
async function completeFromUrl(url: string) {
  if (!supabase) return false;
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new AuthFailure(classifyAuthError(error));
  return true;
}

type AuthValue = {
  /** ログイン状態を確認中 */
  loading: boolean;
  session: Session | null;
  /** デモ（接続先なし）のときは、ログインなしで使える */
  authRequired: boolean;
  /** Supabase側で有効になっている外部ログイン */
  enabledProviders: Record<OAuthProvider, boolean>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** 登録。確認メールが必要なら true を返す */
  signUp: (email: string, password: string, displayName?: string) => Promise<boolean>;
  sendMagicLink: (email: string) => Promise<void>;
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [enabledProviders, setEnabledProviders] = useState({ google: false, apple: false });

  // ログイン状態の読み込みと、変化の見張り
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // どの外部ログインが使えるかを、Supabaseの公開設定から読む
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!active || !s?.external) return;
        setEnabledProviders({
          google: Boolean(s.external.google),
          apple: Boolean(s.external.apple),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // スマホ：メールのリンクなどからアプリが開かれたら、ログインを完了する
  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    Linking.getInitialURL().then((url) => {
      if (url) completeFromUrl(url).catch(() => {});
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      completeFromUrl(url).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new AuthFailure(classifyAuthError(error));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!supabase) return false;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authRedirectUrl(),
        data: displayName?.trim() ? { display_name: displayName.trim() } : undefined,
      },
    });
    if (error) throw new AuthFailure(classifyAuthError(error));
    // 確認メールが必要な設定では、session がまだない
    return !data.session;
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) throw new AuthFailure(classifyAuthError(error));
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    if (!supabase) return;
    const redirectTo = authRedirectUrl();
    if (Platform.OS === 'web') {
      // Web：そのままGoogle/Appleのページへ移動し、/auth/callback に戻ってくる
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw new AuthFailure(classifyAuthError(error));
      return;
    }
    // スマホ：アプリ内のブラウザでログインし、novaai://auth/callback で戻ってくる
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new AuthFailure(classifyAuthError(error));
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'success') await completeFromUrl(result.url);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      authRequired: !isDemoMode,
      enabledProviders,
      signInWithPassword,
      signUp,
      sendMagicLink,
      signInWithProvider,
      signOut,
    }),
    [
      loading,
      session,
      enabledProviders,
      signInWithPassword,
      signUp,
      sendMagicLink,
      signInWithProvider,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** 今のログインの鍵（サーバーに送る用）。ログインしていなければ null */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
