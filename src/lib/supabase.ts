/**
 * Supabase（ログインやデータ保存のサービス）への接続。
 * ログイン状態は端末に保存し、自動で更新する。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { isDemoMode, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

/** Webのサーバー側の下書き（SSR）では保存先がないので、何も保存しない */
const isServer = Platform.OS === 'web' && typeof window === 'undefined';
const noStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: isServer ? noStorage : AsyncStorage,
        autoRefreshToken: !isServer,
        persistSession: !isServer,
        // Webでは、ログイン後に戻ってきたURL（?code=...）を自動で読み取る
        detectSessionInUrl: Platform.OS === 'web' && !isServer,
        // 安全なログイン方式（PKCE）
        flowType: 'pkce',
      },
    });

// スマホでは、アプリが前面にあるときだけログイン状態を自動更新する（Supabase推奨）
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
