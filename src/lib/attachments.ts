/**
 * 写真・ファイルの添付（＋ボタン）。
 * - 選ぶ：カメラ・アルバム（expo-image-picker）、ファイル（expo-document-picker）
 * - 写真は送る前に小さくする（長い辺 1600px・JPEG）。通信量とAIの料金を抑えるため。
 * - 置く：Supabase Storage の attachments バケット（非公開）の「<ユーザーID>/」フォルダ。
 *   安全ルールにより、本人しか読み書き・削除できない。
 */
import * as DocumentPicker from 'expo-document-picker';
import { File as NativeFile } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import type { Attachment } from '@/lib/chat-types';
import { supabase } from '@/lib/supabase';

export const BUCKET = 'attachments';
/** 1回の送信で付けられる数（サーバーと同じ） */
export const MAX_ATTACHMENTS = 4;
/** 1つのファイルの最大サイズ（Storage の設定と同じ 20MB） */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 写真の長い辺の最大ピクセル */
const MAX_IMAGE_SIDE = 1600;

const IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];
/** ファイルとして送れるもの（拡張子 → 種類） */
const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
};
const EXT_OF: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
};

/** 選んだけれど、まだ置き場所に送っていないもの */
export type PickedFile = {
  kind: 'image' | 'file';
  uri: string;
  name: string;
  mime: string;
  size?: number;
  width?: number;
  height?: number;
};

export type AttachError = 'permission' | 'unsupported' | 'too_large' | 'too_many' | 'upload_failed';

export class AttachmentError extends Error {
  readonly code: AttachError;
  constructor(code: AttachError) {
    super(code);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

function storage() {
  if (!supabase) throw new AttachmentError('upload_failed');
  return supabase.storage.from(BUCKET);
}

/** 写真を小さくして JPEG にする（失敗したら元のまま） */
async function shrinkImage(p: PickedFile): Promise<PickedFile> {
  try {
    const context = ImageManipulator.manipulate(p.uri);
    const w = p.width ?? 0;
    const h = p.height ?? 0;
    if (w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE || !w || !h) {
      context.resize(w >= h ? { width: MAX_IMAGE_SIDE } : { height: MAX_IMAGE_SIDE });
    }
    const ref = await context.renderAsync();
    const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    const base = p.name.replace(/\.[^.]+$/, '') || 'photo';
    return {
      ...p,
      uri: out.uri,
      width: out.width,
      height: out.height,
      mime: 'image/jpeg',
      name: `${base}.jpg`,
      size: undefined,
    };
  } catch (e) {
    if (__DEV__) console.warn('[NAYQO] image resize failed', e);
    // HEIC など、小さくできない形式のまま送ると Storage が受け付けないので、JPEG/PNG/WebP/GIF だけ通す
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(p.mime)) {
      throw new AttachmentError('unsupported');
    }
    return p;
  }
}

/** カメラで撮る（source='camera'）／アルバムから選ぶ（source='library'） */
export async function pickImages(
  source: 'camera' | 'library',
  limit: number,
): Promise<PickedFile[]> {
  if (limit <= 0) return [];
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new AttachmentError('permission');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsMultipleSelection: source === 'library' && limit > 1,
    selectionLimit: limit,
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets) return [];
  const picked = result.assets.slice(0, limit).map(
    (a): PickedFile => ({
      kind: 'image',
      uri: a.uri,
      name: a.fileName || 'photo.jpg',
      mime: a.mimeType || 'image/jpeg',
      size: a.fileSize,
      width: a.width,
      height: a.height,
    }),
  );
  return Promise.all(picked.map(shrinkImage));
}

/** ファイルを選ぶ（PDF・テキスト・写真） */
export async function pickFiles(limit: number): Promise<PickedFile[]> {
  if (limit <= 0) return [];
  const result = await DocumentPicker.getDocumentAsync({
    type: [...Object.values(FILE_TYPES), 'text/x-markdown', ...IMAGE_MIME],
    multiple: limit > 1,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets) return [];
  const out: PickedFile[] = [];
  for (const a of result.assets.slice(0, limit)) {
    const ext = (a.name.split('.').pop() ?? '').toLowerCase();
    const mime = (a.mimeType ?? '').toLowerCase();
    if (IMAGE_MIME.includes(mime) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) {
      out.push(
        await shrinkImage({ kind: 'image', uri: a.uri, name: a.name, mime: mime || 'image/jpeg' }),
      );
      continue;
    }
    const fileMime = FILE_TYPES[ext] ?? (Object.values(FILE_TYPES).includes(mime) ? mime : null);
    if (!fileMime) throw new AttachmentError('unsupported');
    if (a.size && a.size > MAX_FILE_BYTES) throw new AttachmentError('too_large');
    out.push({ kind: 'file', uri: a.uri, name: a.name, mime: fileMime, size: a.size });
  }
  return out;
}

/** 端末の中のファイルを読み出す */
async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new NativeFile(uri).arrayBuffer();
}

/** 選んだものを置き場所に送り、発言に付ける情報を返す */
export async function uploadAttachment(p: PickedFile): Promise<Attachment> {
  if (!supabase) throw new AttachmentError('upload_failed');
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new AttachmentError('upload_failed');

  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(p.uri);
  } catch {
    throw new AttachmentError('upload_failed');
  }
  if (bytes.byteLength > MAX_FILE_BYTES) throw new AttachmentError('too_large');

  const ext = EXT_OF[p.mime];
  if (!ext) throw new AttachmentError('unsupported');
  const path = `${userId}/${randomUUID()}.${ext}`;
  const { error } = await storage().upload(path, bytes, { contentType: p.mime, upsert: false });
  if (error) {
    if (__DEV__) console.warn('[NAYQO] upload failed', error);
    throw new AttachmentError('upload_failed');
  }
  rememberLocal(path, p.uri);
  return {
    kind: p.kind,
    path,
    name: p.name,
    mime: p.mime,
    size: bytes.byteLength,
    ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
  };
}

/** 置き場所からファイルを消す（失敗しても止めない） */
export async function removeAttachmentFiles(paths: string[]) {
  if (!paths.length || !supabase) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await storage().remove(paths.slice(i, i + 100));
    if (error && __DEV__) console.warn('[NAYQO] remove files failed', error);
  }
}

// ---- 表示用のURL ----

/** 自分で送った写真は、手元の画像をそのまま表示する（読み込みを待たなくてよい） */
const localUris = new Map<string, string>();
function rememberLocal(path: string, uri: string) {
  localUris.set(path, uri);
}

const signedCache = new Map<string, { url: string; expires: number }>();
const SIGNED_SECONDS = 60 * 60;

/** 写真・ファイルを表示するためのURL（本人だけが使える期限付きのURL） */
export async function attachmentUrl(path: string): Promise<string | null> {
  const local = localUris.get(path);
  if (local) return local;
  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  try {
    const { data, error } = await storage().createSignedUrl(path, SIGNED_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedCache.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** すぐ表示できるURLがあれば返す（待たずに描くため） */
export function cachedAttachmentUrl(path: string): string | null {
  const local = localUris.get(path);
  if (local) return local;
  const cached = signedCache.get(path);
  return cached && cached.expires > Date.now() + 60_000 ? cached.url : null;
}

export function formatBytes(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
