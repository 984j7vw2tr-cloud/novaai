/**
 * 写真・ファイルの添付（＋ボタン）をAIに渡す形に変える。
 *
 * - アプリはファイルを Supabase Storage（attachments バケット・非公開）に置き、
 *   発言には「保存場所（path）・名前・種類」だけを付けて送ってくる。
 * - サーバーは、本人のフォルダ（<ユーザーID>/...）のファイルだけを取り出し、AIに渡す。
 *   写真 → 画像として、PDF → ファイルとして、テキスト類 → 本文として渡す。
 */
import type { Env } from '../_shared/auth.ts';
import type { ContentPart } from './providers/types.ts';

/** 1つの発言に付けられる添付の数 */
export const MAX_ATTACHMENTS = 4;
/** 添付1つの最大サイズ（Storage 側の上限と同じ） */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** テキストファイルをAIに渡すときの最大文字数（長すぎると料金が膨らむ） */
export const MAX_TEXT_FILE_CHARS = 20000;
/** 本物のファイルをAIに渡すのは、添付付きの発言のうち直近いくつまでか（古いものは名前だけ伝える） */
export const ATTACHMENT_MESSAGES_WITH_CONTENT = 2;

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const TEXT_MIME = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
export const PDF_MIME = 'application/pdf';

export type Attachment = {
  kind: 'image' | 'file';
  /** Storage の中の場所：<ユーザーID>/<ランダムなID>.<拡張子> */
  path: string;
  name: string;
  mime: string;
};

const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf|txt|md|csv|json)$/i;

/** アプリから届いた添付の一覧を確かめる。おかしければ null */
export function parseAttachments(raw: unknown): Attachment[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return null;
  const out: Attachment[] = [];
  for (const a of raw) {
    const kind = (a as { kind?: unknown })?.kind;
    const path = (a as { path?: unknown })?.path;
    const name = (a as { name?: unknown })?.name;
    const mime = (a as { mime?: unknown })?.mime;
    if (kind !== 'image' && kind !== 'file') return null;
    if (typeof path !== 'string' || !PATH_RE.test(path)) return null;
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) return null;
    if (typeof mime !== 'string') return null;
    const allowed = kind === 'image' ? IMAGE_MIME : [PDF_MIME, ...TEXT_MIME, ...IMAGE_MIME];
    if (!allowed.includes(mime)) return null;
    out.push({ kind, path, name, mime });
  }
  return out;
}

/** 添付が本人のフォルダのものか（他人のファイルを読ませないため） */
export const ownsAll = (attachments: Attachment[], userId: string) =>
  attachments.every((a) => a.path.startsWith(`${userId}/`));

/** Storage からファイルを取り出す（サーバー専用の鍵を使う。持ち主の確認は ownsAll で済ませておく） */
export async function downloadAttachment(
  env: Env,
  doFetch: typeof fetch,
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const supabaseUrl = env.get('SUPABASE_URL');
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) throw new AttachmentError('storage_not_configured');
  const res = await doFetch(
    `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/attachments/${path}`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: signal ?? AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new AttachmentError(`download_http_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) throw new AttachmentError('too_large');
  return buf;
}

export class AttachmentError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
    this.name = 'AttachmentError';
  }
}

/** バイト列を base64 にする（大きなファイルでも落ちないよう、少しずつ変換） */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 添付の中身を、AIに渡す部品にする */
export function attachmentPart(a: Attachment, bytes: Uint8Array): ContentPart {
  if (IMAGE_MIME.includes(a.mime)) {
    return { type: 'image_url', image_url: { url: `data:${a.mime};base64,${toBase64(bytes)}` } };
  }
  if (a.mime === PDF_MIME) {
    return {
      type: 'file',
      file: { filename: a.name, file_data: `data:${PDF_MIME};base64,${toBase64(bytes)}` },
    };
  }
  let text = new TextDecoder().decode(bytes);
  const cut = text.length > MAX_TEXT_FILE_CHARS;
  if (cut) text = text.slice(0, MAX_TEXT_FILE_CHARS);
  return {
    type: 'text',
    text: `[Attached file: ${a.name}${cut ? ` (first ${MAX_TEXT_FILE_CHARS} characters)` : ''}]\n${text}`,
  };
}

/** 古い発言の添付は、中身を渡さず「何が付いていたか」だけ伝える */
export function attachmentNote(attachments: Attachment[]): string {
  const names = attachments.map((a) =>
    a.kind === 'image' ? `image "${a.name}"` : `file "${a.name}"`,
  );
  return `[The user attached earlier: ${names.join(', ')}. Its content is no longer shown.]`;
}
