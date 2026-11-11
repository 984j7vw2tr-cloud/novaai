import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { transcribe, type VoiceError, VoiceInputError } from '@/lib/voice';

/** 1回の録音の最大時間（これを過ぎたら自動で止めて文字にする） */
const MAX_SECONDS = 120;

export type VoiceState = 'idle' | 'recording' | 'transcribing';

/**
 * マイクボタン：押すと録音開始、もう一度押すと止めて文字にする。
 * 文字になったら onText に渡す（入力欄に追加される）。
 */
export function useVoiceInput(onText: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);
  const stateRef = useRef<VoiceState>('idle');
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const set = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording') return;
    set('transcribing');
    try {
      await recorder.stop();
      if (Platform.OS !== 'web') {
        // 録音モードを戻す（iPhoneで音が小さくなるのを防ぐ）
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
      const uri = recorder.uri;
      if (!uri) throw new VoiceInputError('failed');
      const text = (await transcribe(uri)).trim();
      if (text) onTextRef.current(text);
    } catch (e) {
      setError(e instanceof VoiceInputError ? e.code : 'failed');
      if (__DEV__) console.warn('[Karakuchi] voice input failed', e);
    } finally {
      set('idle');
    }
  }, [recorder]);

  const start = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('permission');
        return;
      }
      if (Platform.OS !== 'web') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setSeconds(0);
      set('recording');
    } catch (e) {
      // ブラウザでマイクを拒否したときもここに来る
      const denied =
        e instanceof Error && /denied|NotAllowed|permission/i.test(`${e.name} ${e.message}`);
      setError(denied ? 'permission' : 'failed');
      set('idle');
      if (__DEV__) console.warn('[Karakuchi] voice start failed', e);
    }
  }, [recorder]);

  // 録音時間を数える。最大時間を過ぎたら自動で止める
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) void stop();
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, stop]);

  /** 録音をやめて、文字にしない */
  const cancel = useCallback(async () => {
    if (stateRef.current !== 'recording') return;
    set('idle');
    try {
      await recorder.stop();
    } catch {
      // すでに止まっている
    }
  }, [recorder]);

  return { state, seconds, error, clearError: () => setError(null), start, stop, cancel };
}
