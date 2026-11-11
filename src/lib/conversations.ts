/**
 * 会話の保存・読み込み・削除（Supabaseのデータベース）。
 * 安全ルール（RLS）により、自分の会話しか読み書きできない。
 */
import { removeAttachmentFiles } from '@/lib/attachments';
import type { Attachment, ChatMessage } from '@/lib/chat-types';
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
  message: Pick<ChatMessage, 'id' | 'role' | 'content' | 'attachments'>,
) {
  const { error } = await db()
    .from('messages')
    .insert({
      id: message.id,
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
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
    .select('id, role, content, attachments')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as ChatMessage['role'],
    content: m.content as string,
    attachments:
      Array.isArray(m.attachments) && m.attachments.length
        ? (m.attachments as Attachment[])
        : undefined,
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

/** 会話に付いていた写真・ファイルの場所を集める */
async function attachmentPaths(filter: { conversationId?: string }) {
  let q = db().from('messages').select('attachments').neq('attachments', '[]');
  if (filter.conversationId) q = q.eq('conversation_id', filter.conversationId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).flatMap((m) =>
    Array.isArray(m.attachments) ? (m.attachments as Attachment[]).map((a) => a.path) : [],
  );
}

/** 会話を削除する（付いていた写真・ファイルも置き場所から消す） */
export async function deleteConversation(id: string) {
  const paths = await attachmentPaths({ conversationId: id }).catch(() => [] as string[]);
  const { error } = await db().from('conversations').delete().eq('id', id);
  if (error) throw error;
  await removeAttachmentFiles(paths);
}

/** 自分の会話をすべて削除する（中のメッセージ・写真・ファイルも一緒に消える） */
export async function deleteAllConversations(userId: string) {
  const { error } = await db().from('conversations').delete().eq('user_id', userId);
  if (error) throw error;
  // 送らずに残ったものも含め、自分のフォルダをまるごと空にする
  await removeAllMyFiles(userId);
}

async function removeAllMyFiles(userId: string) {
  const bucket = db().storage.from('attachments');
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(userId, { limit: 1000 });
    if (error || !data?.length) return;
    await removeAttachmentFiles(data.map((f) => `${userId}/${f.name}`));
  }
}
