/**
 * アプリの接続先の設定。
 * 値は .env.local ファイルに書く（.env.example を参照）。
 *
 * ここに入れてよいのは「公開しても安全な値」だけ。
 * - SupabaseのURL、Publishable key（anon key）→ 公開OK（アプリに入る前提の値）
 * - OpenAIのAPIキー → 絶対にここに入れない（Supabaseのサーバー側にだけ置く）
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** 接続先が設定されていなければ、デモ返答で動かす */
export const isDemoMode = !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY;
