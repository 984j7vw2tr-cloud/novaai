/**
 * NAYQOの記憶（memories の表）。本人は「見る」「消す」だけできる（書き込むのはサーバー）。
 * 記憶のオン・オフは profiles.memory_enabled。
 */
import { supabase } from '@/lib/supabase';

export type MemoryKind = 'fact' | 'goal' | 'task';
export type MemoryStatus = 'open' | 'done' | 'failed' | 'dropped';

export type Memory = {
  id: string;
  kind: MemoryKind;
  content: string;
  dueAt: string | null;
  status: MemoryStatus;
  createdAt: string;
};

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** 覚えていること・目標・まだの宿題と、最近（30日）終わった宿題 */
export async function listMemories(): Promise<Memory[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await db()
    .from('memories')
    .select('id, kind, content, due_at, status, created_at, checked_at')
    .or(`status.eq.open,checked_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as MemoryKind,
    content: r.content as string,
    dueAt: (r.due_at as string | null) ?? null,
    status: r.status as MemoryStatus,
    createdAt: r.created_at as string,
  }));
}

export async function deleteMemory(id: string) {
  const { error } = await db().from('memories').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllMemories(userId: string) {
  const { error } = await db().from('memories').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function getMemoryEnabled(userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('profiles')
    .select('memory_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.memory_enabled as boolean | undefined) ?? true;
}

export async function setMemoryEnabled(userId: string, enabled: boolean) {
  const { error } = await db()
    .from('profiles')
    .update({ memory_enabled: enabled })
    .eq('id', userId);
  if (error) throw error;
}
