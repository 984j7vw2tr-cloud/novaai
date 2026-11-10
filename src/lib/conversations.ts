/**
 * 会話の保存・読み込み・削除（Supabaseのデータベース）。
 * 安全ルール（RLS）により、自分の会話しか読み書きできない。
 */
import type { ChatMessage } from '@/lib/chat-types';
import { supabase } from '@/lib/supabase';

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

/** 会話の題名：最初の質問の先頭を使う */
export function titleFrom(text: string) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function createConversation(title: string): Promise<string> {
  const { data, error } = await db().from('conversations').insert({ title }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function saveMessage(
  conversationId: string,
  message: Pick<ChatMessage, 'id' | 'role' | 'content'>,
) {
  const { error } = await db().from('messages').insert({
    id: message.id,
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
  });
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  const { error } = await db().from('messages').delete().eq('id', id);
  if (error) throw error;
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await db()
    .from('messages')
    .select('id, role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as ChatMessage['role'],
    content: m.content as string,
    status: 'done' as const,
  }));
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await db()
    .from('conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    title: (c.title as string | null) ?? null,
    updatedAt: c.updated_at as string,
  }));
}

export async function deleteConversation(id: string) {
  const { error } = await db().from('conversations').delete().eq('id', id);
  if (error) throw error;
}
