/**
 * 声で入力：録音した音声をサーバー（transcribe 関数）に送り、文字にしてもらう。
 * 音声はサーバーで文字にしたらすぐ捨てる（保存しない）。
 */
import { fetch } from 'expo/fetch';
import { File as NativeFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { getAccessToken } from '@/auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

export type VoiceError = 'permission' | 'too_short' | 'failed' | 'rate_limited';

export class VoiceInputError extends Error {
  readonly code: VoiceError;
  constructor(code: VoiceError) {
    super(code);
    this.name = 'VoiceInputError';
    this.code = code;
  }
}

/** 録音ファイルを読み、種類（audio/webm など）と中身を返す */
async function readRecording(uri: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await globalThis.fetch(uri)).blob();
    return { bytes: await blob.arrayBuffer(), mime: blob.type.split(';')[0] || 'audio/webm' };
  }
  // スマホの録音は m4a（AAC）
  const bytes = await new NativeFile(uri).arrayBuffer();
  return { bytes, mime: 'audio/mp4' };
}

export async function transcribe(uri: string): Promise<string> {
  let audio: { bytes: ArrayBuffer; mime: string };
  try {
    audio = await readRecording(uri);
  } catch {
    throw new VoiceInputError('failed');
  }
  if (audio.bytes.byteLength < 1000) throw new VoiceInputError('too_short');
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': audio.mime,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: new Uint8Array(audio.bytes),
    });
  } catch {
    throw new VoiceInputError('failed');
  }
  if (res.status === 429) throw new VoiceInputError('rate_limited');
  if (!res.ok) throw new VoiceInputError('failed');
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === 'string' ? data.text : '';
}
