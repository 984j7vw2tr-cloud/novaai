/** プロフィール（profiles の表）の読み書き。自分の行しか触れない（RLS） */
import { supabase } from '@/lib/supabase';

export type Profile = { displayName: string; preferredLanguage: string | null };

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, preferred_language')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    displayName: (data.display_name as string | null) ?? '',
    preferredLanguage: (data.preferred_language as string | null) ?? null,
  };
}

export async function updateProfile(
  userId: string,
  changes: { displayName?: string; preferredLanguage?: string },
) {
  if (!supabase) return;
  const row: Record<string, string> = {};
  if (changes.displayName !== undefined) row.display_name = changes.displayName.trim().slice(0, 50);
  if (changes.preferredLanguage !== undefined) row.preferred_language = changes.preferredLanguage;
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) throw error;
}
