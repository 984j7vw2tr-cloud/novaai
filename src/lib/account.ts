/** アカウントの削除（サーバーの account 関数に頼む。本人のアカウントだけが消える） */
import { fetch } from 'expo/fetch';

import { getAccessToken } from '@/auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export async function deleteMyAccount() {
  const token = await getAccessToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'delete' }),
  });
  if (!res.ok) throw new Error(`delete failed: HTTP ${res.status}`);
  // 端末に残っているログイン情報も消す（アカウントはもう無いので、サーバーへの通知は不要）
  await supabase?.auth.signOut({ scope: 'local' });
}
