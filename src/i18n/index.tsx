/**
 * 多言語対応の中心。
 * - 表示言語（ボタンや案内の言語）：自動（端末の言語）または手動で選ぶ
 * - 回答言語（NOVAが答える言語）：自動（質問の言語）または手動で選ぶ
 * の2つを別々に管理し、端末に保存する。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { I18nManager, Platform } from 'react-native';

import {
  FALLBACK_LANGUAGE,
  getLanguage,
  isLanguageCode,
  type LanguageCode,
  matchLanguageTag,
} from './languages';
import type { Strings } from './types';

export type LanguagePreference = LanguageCode | 'auto';

const STORAGE_KEY = 'nova.language.v1';

type Stored = { ui: LanguagePreference; reply: LanguagePreference };

// 端末の言語は起動中に変わらないものとして扱う（変更の通知は不要）
const subscribeNothing = () => () => {};
let cachedDeviceLanguage: LanguageCode | null = null;
const getDeviceLanguage = () => (cachedDeviceLanguage ??= detectDeviceLanguage());
/** Webのサーバー側の下書き（SSR）では端末の言語がわからないので、いったん英語で作る */
const getServerLanguage = () => FALLBACK_LANGUAGE;

/** 端末の言語から、対応言語を選ぶ（対応外なら英語） */
export function detectDeviceLanguage(): LanguageCode {
  try {
    for (const locale of getLocales()) {
      const match = matchLanguageTag(locale.languageTag);
      if (match) return match;
    }
  } catch {
    // 取得できない環境では英語
  }
  return FALLBACK_LANGUAGE;
}

/** 端末に保存した言語設定を読む（なければ両方「自動」） */
async function readStoredPrefs(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ui: 'auto', reply: 'auto' };
    const data = JSON.parse(raw) as Partial<Stored>;
    const valid = (p: unknown): LanguagePreference =>
      p === 'auto' || isLanguageCode(p) ? (p as LanguagePreference) : 'auto';
    return { ui: valid(data.ui), reply: valid(data.reply) };
  } catch {
    return { ui: 'auto', reply: 'auto' };
  }
}

/**
 * サーバーに送る言語設定。送信のたびに保存先から読むので、起動直後でも確実に最新になる。
 * replyLanguage: 'auto' なら質問の言語で答える
 * uiLanguage: 質問の言語が判断できないとき（絵文字だけ等）に使う
 */
export async function getLanguageSettings(): Promise<{
  replyLanguage: LanguagePreference;
  uiLanguage: LanguageCode;
}> {
  const prefs = await readStoredPrefs();
  return {
    replyLanguage: prefs.reply,
    uiLanguage: prefs.ui === 'auto' ? getDeviceLanguage() : prefs.ui,
  };
}

type I18nValue = {
  /** 今の表示言語の文言 */
  t: Strings;
  /** 実際に使っている表示言語 */
  uiLanguage: LanguageCode;
  uiPreference: LanguagePreference;
  replyPreference: LanguagePreference;
  setUiPreference: (p: LanguagePreference) => void;
  setReplyPreference: (p: LanguagePreference) => void;
  /** 右から左に書く言語か */
  isRTL: boolean;
  /** スマホで右から左の切り替えに再起動が必要なとき true */
  needsRestart: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // サーバーの下書きとブラウザの表示を一致させたうえで、表示後に端末の言語へ切り替える
  const deviceLanguage = useSyncExternalStore(
    subscribeNothing,
    getDeviceLanguage,
    getServerLanguage,
  );
  const [prefs, setPrefs] = useState<Stored>({ ui: 'auto', reply: 'auto' });

  // 保存してある設定を読む
  useEffect(() => {
    let cancelled = false;
    readStoredPrefs().then((stored) => {
      if (!cancelled) setPrefs(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((next: Stored) => {
    setPrefs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const uiLanguage: LanguageCode = prefs.ui === 'auto' ? deviceLanguage : prefs.ui;
  const lang = getLanguage(uiLanguage);
  const isRTL = lang.rtl;
  // スマホは、右から左の切り替えにアプリの再起動が必要（I18nManager.isRTL は再起動まで変わらない）
  const needsRestart = Platform.OS !== 'web' && I18nManager.isRTL !== isRTL;

  // 右から左（アラビア語など）の表示
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = uiLanguage;
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      }
      return;
    }
    // スマホ：次に起動したときから右から左の表示になるよう設定しておく
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
    }
  }, [uiLanguage, isRTL]);

  const value = useMemo<I18nValue>(
    () => ({
      t: lang.strings,
      uiLanguage,
      uiPreference: prefs.ui,
      replyPreference: prefs.reply,
      setUiPreference: (ui) => save({ ...prefs, ui }),
      setReplyPreference: (reply) => save({ ...prefs, reply }),
      isRTL,
      needsRestart,
    }),
    [lang, uiLanguage, prefs, save, isRTL, needsRestart],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <LanguageProvider>');
  return value;
}
