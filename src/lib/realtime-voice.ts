/**
 * 音声会話（リアルタイム）。ブラウザ（Web）だけで動く。
 * 1. サーバー（voice 関数）から、1分で切れる使い捨ての鍵をもらう（今日の残り時間もわかる）
 * 2. その鍵で、ブラウザから OpenAI に WebRTC で直接つなぐ（声が速く届く）
 * 3. 終わったら、話した時間をサーバーに知らせる
 * 本物の鍵（OpenAI の APIキー）はアプリに来ない。
 */
import { getAccessToken } from '@/auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

export type VoiceCallState = 'connecting' | 'listening' | 'userSpeaking' | 'speaking' | 'ended';

export type VoiceTurn = { id: string; role: 'user' | 'assistant'; text: string };

export type VoiceCallError =
  | 'unsupported'
  | 'permission'
  | 'limit'
  | 'unauthorized'
  | 'rate_limited'
  | 'failed';

export class VoiceCallFailure extends Error {
  readonly code: VoiceCallError;
  readonly info: { plan?: string; limitSeconds?: number; resetAt?: string | null };
  constructor(code: VoiceCallError, info: VoiceCallFailure['info'] = {}) {
    super(code);
    this.name = 'VoiceCallFailure';
    this.code = code;
    this.info = info;
  }
}

type StartInfo = {
  clientSecret: string;
  model: string;
  sessionId: string;
  remainingSeconds: number;
  limitSeconds: number;
  plan: string;
};

async function callVoiceApi(body: unknown, keepalive = false): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${SUPABASE_URL}/functions/v1/voice`, {
    method: 'POST',
    keepalive,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function voiceCallSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export type VoiceCall = {
  /** 今日の残り（この通話で話せる最大の秒数） */
  remainingSeconds: number;
  limitSeconds: number;
  plan: string;
  setMuted(muted: boolean): void;
  /** 終える（話した秒数をサーバーに知らせる） */
  end(): void;
};

export async function startVoiceCall(opts: {
  settings: { replyLanguage?: string | null; uiLanguage?: string | null };
  /** 一時チャットから開いた（NAYQOの記憶を使わない） */
  temporary?: boolean;
  onState: (s: VoiceCallState) => void;
  onTurns: (turns: VoiceTurn[]) => void;
  /** 音の大きさ（0〜1）：自分の声・NAYQOの声 */
  onLevel?: (level: { user: number; assistant: number }) => void;
  /** 回線が切れた・エラーで終わった */
  onDrop?: () => void;
  /** 今日の残り時間を使い切って終わった */
  onTimeUp?: () => void;
}): Promise<VoiceCall> {
  if (!voiceCallSupported()) throw new VoiceCallFailure('unsupported');

  // 先にマイクの許可をもらう（断られたら鍵をもらわない＝時間も使わない）
  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new VoiceCallFailure('permission');
  }
  const stopMic = () => mic.getTracks().forEach((t) => t.stop());

  let res: Response;
  try {
    res = await callVoiceApi({
      action: 'start',
      settings: opts.settings,
      ...(opts.temporary ? { temporary: true } : {}),
    });
  } catch {
    stopMic();
    throw new VoiceCallFailure('failed');
  }
  if (!res.ok) {
    stopMic();
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      plan?: string;
      limitSeconds?: number;
      resetAt?: string | null;
    };
    if (res.status === 401) throw new VoiceCallFailure('unauthorized');
    if (data.code === 'voice_limit') throw new VoiceCallFailure('limit', data);
    if (res.status === 429) throw new VoiceCallFailure('rate_limited');
    throw new VoiceCallFailure('failed');
  }
  const info = (await res.json()) as StartInfo;

  const pc = new RTCPeerConnection();
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  let ended = false;
  const startedAt = Date.now();
  let audioCtx: AudioContext | null = null;
  let raf = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const turns: VoiceTurn[] = [];
  const emitTurns = () => opts.onTurns(turns.map((t) => ({ ...t })));
  const turn = (id: string, role: VoiceTurn['role']) => {
    let t = turns.find((x) => x.id === id);
    if (!t) {
      t = { id, role, text: '' };
      turns.push(t);
    }
    return t;
  };

  const finish = (dropped: boolean) => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    clearInterval(ticker);
    try {
      dc.close();
    } catch {
      // すでに閉じている
    }
    pc.close();
    stopMic();
    audioEl.srcObject = null;
    void audioCtx?.close().catch(() => {});
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    void callVoiceApi({ action: 'end', sessionId: info.sessionId, seconds }, true).catch(() => {});
    opts.onState('ended');
    if (dropped) opts.onDrop?.();
  };

  // NAYQOの声を流す
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
    void audioEl.play().catch(() => {});
    watchLevels(e.streams[0]);
  };
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') finish(true);
  };

  // 音の大きさ（丸いアニメーション用）
  const watchLevels = (remote: MediaStream) => {
    if (!opts.onLevel) return;
    try {
      audioCtx = new AudioContext();
      const mk = (stream: MediaStream) => {
        const a = audioCtx!.createAnalyser();
        a.fftSize = 512;
        audioCtx!.createMediaStreamSource(stream).connect(a);
        return a;
      };
      const user = mk(mic);
      const assistant = mk(remote);
      const buf = new Uint8Array(512);
      const level = (a: AnalyserNode) => {
        a.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / buf.length) * 4);
      };
      const tick = () => {
        if (ended) return;
        opts.onLevel?.({ user: level(user), assistant: level(assistant) });
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // 音の大きさが取れなくても会話はできる
    }
  };

  // 出来事（文字起こし・話し始め など）を受け取る通り道
  const dc = pc.createDataChannel('oai-events');
  dc.onmessage = (m) => {
    let e: {
      type: string;
      item_id?: string;
      delta?: string;
      transcript?: string;
      item?: { id?: string; role?: string };
    };
    try {
      e = JSON.parse(String(m.data));
    } catch {
      return;
    }
    switch (e.type) {
      case 'input_audio_buffer.speech_started':
        opts.onState('userSpeaking');
        break;
      case 'input_audio_buffer.speech_stopped':
        opts.onState('listening');
        break;
      case 'input_audio_buffer.committed':
        // 自分の発言の場所を先に確保（文字起こしはあとから届く）
        if (e.item_id) turn(e.item_id, 'user');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (e.item_id) {
          turn(e.item_id, 'user').text = (e.transcript ?? '').trim();
          emitTurns();
        }
        break;
      case 'response.output_item.added':
        if (e.item?.id && e.item.role === 'assistant') turn(e.item.id, 'assistant');
        break;
      case 'response.output_audio_transcript.delta':
        if (e.item_id && e.delta) {
          turn(e.item_id, 'assistant').text += e.delta;
          emitTurns();
        }
        break;
      case 'output_audio_buffer.started':
        opts.onState('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        opts.onState('listening');
        break;
      case 'error':
        if (__DEV__) console.warn('[NAYQO] realtime error', e);
        break;
    }
  };
  dc.onopen = () => opts.onState('listening');

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(info.model)}`,
      {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${info.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
      },
    );
    if (!sdp.ok) throw new Error(`realtime HTTP ${sdp.status}`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
  } catch (e) {
    if (__DEV__) console.warn('[NAYQO] realtime connect failed', e);
    finish(false);
    throw new VoiceCallFailure('failed');
  }

  // 約20秒ごとに、話した時間をサーバーに知らせる（ブラウザが突然閉じても、その分だけ数えるため）
  ticker = setInterval(() => {
    if (ended) return;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    void callVoiceApi({ action: 'tick', sessionId: info.sessionId, seconds }).catch(() => {});
  }, 20_000);
  // 残り時間になったら自動で終える
  const timer = setTimeout(() => {
    finish(false);
    opts.onTimeUp?.();
  }, info.remainingSeconds * 1000);
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'closed') clearTimeout(timer);
  });

  return {
    remainingSeconds: info.remainingSeconds,
    limitSeconds: info.limitSeconds,
    plan: info.plan,
    setMuted: (muted) => mic.getAudioTracks().forEach((t) => (t.enabled = !muted)),
    end: () => {
      clearTimeout(timer);
      clearInterval(ticker);
      finish(false);
    },
  };
}
