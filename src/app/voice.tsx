/**
 * 音声会話（リアルタイム）の画面。電話のように NAYQO と声で話す。
 * - 開くとすぐつながる。真ん中の丸が、声の大きさに合わせて動く。
 * - 1日に話せる時間：無料3分・PLUS 30分（サーバーで数える）。残り時間を上に表示。
 * - 終えると、話した内容（文字起こし）を会話として履歴に保存して、その会話を開く。
 *   一時チャット中に開いたとき（?temporary=1）は保存しない。
 */
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { Icon } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getLanguageSettings, useI18n } from '@/i18n';
import { getBillingStatus } from '@/lib/billing';
import { createConversation, saveMessage, titleFrom } from '@/lib/conversations';
import { isActive } from '@/lib/pressable';
import {
  startVoiceCall,
  type VoiceCall,
  VoiceCallFailure,
  type VoiceCallState,
  voiceCallSupported,
  type VoiceTurn,
} from '@/lib/realtime-voice';

type Problem =
  | { kind: 'permission' | 'failed' | 'unsupported' | 'dropped' | 'timeUp' }
  | { kind: 'limit'; plan: string; minutes: number; plusMinutes: number | null };

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function VoiceScreen() {
  const { t } = useI18n();
  const { temporary } = useLocalSearchParams<{ temporary?: string }>();
  const saveHistory = temporary !== '1';

  const [state, setState] = useState<VoiceCallState>('connecting');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [level, setLevel] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const callRef = useRef<VoiceCall | null>(null);
  const turnsRef = useRef<VoiceTurn[]>([]);
  const savedRef = useRef(false);

  /** 話した内容を履歴に保存する（1回だけ）。保存した会話のIDを返す */
  const saveTranscript = useCallback(async (): Promise<string | null> => {
    if (savedRef.current || !saveHistory) return null;
    const said = turnsRef.current.filter((x) => x.text.trim());
    if (!said.some((x) => x.role === 'user')) return null;
    savedRef.current = true;
    try {
      const firstUser = said.find((x) => x.role === 'user')?.text ?? t.voiceTitle;
      const cid = await createConversation(`🎙 ${titleFrom(firstUser)}`);
      for (const x of said) {
        await saveMessage(cid, { id: randomUUID(), role: x.role, content: x.text.trim() });
      }
      return cid;
    } catch {
      return null;
    }
  }, [saveHistory, t.voiceTitle]);

  // 開いたらつなぐ（「もう一度」で attempt が増えたら、つなぎ直す）
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      if (Platform.OS !== 'web' || !voiceCallSupported()) {
        setProblem({ kind: 'unsupported' });
        return;
      }
      setState('connecting');
      setProblem(null);
      try {
        const settings = await getLanguageSettings();
        const call = await startVoiceCall({
          settings: {
            replyLanguage: settings.replyLanguage === 'auto' ? null : settings.replyLanguage,
            uiLanguage: settings.uiLanguage,
          },
          onState: (s) => !cancelled && setState(s),
          onTurns: (next) => {
            turnsRef.current = next;
            if (!cancelled) setTurns(next);
          },
          onLevel: ({ user, assistant }) => {
            if (cancelled) return;
            const v = Math.max(user, assistant);
            setLevel((prev) => (Math.abs(prev - v) > 0.03 ? v : prev));
          },
          onDrop: () => !cancelled && setProblem({ kind: 'dropped' }),
          onTimeUp: () => !cancelled && setProblem({ kind: 'timeUp' }),
        });
        if (cancelled) {
          call.end();
          return;
        }
        callRef.current = call;
        const endsAt = Date.now() + call.remainingSeconds * 1000;
        setLeft(call.remainingSeconds);
        timer = setInterval(() => setLeft(Math.max(0, (endsAt - Date.now()) / 1000)), 500);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof VoiceCallFailure && e.code === 'limit') {
          let plusMinutes: number | null = null;
          try {
            plusMinutes = (await getBillingStatus()).voiceMinutes?.plus ?? null;
          } catch {
            // 分からなければ数字なしで出す
          }
          setProblem({
            kind: 'limit',
            plan: e.info.plan ?? 'free',
            minutes: Math.round((e.info.limitSeconds ?? 0) / 60),
            plusMinutes,
          });
        } else if (e instanceof VoiceCallFailure && e.code === 'permission') {
          setProblem({ kind: 'permission' });
        } else if (e instanceof VoiceCallFailure && e.code === 'unsupported') {
          setProblem({ kind: 'unsupported' });
        } else {
          setProblem({ kind: 'failed' });
        }
        setState('ended');
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      callRef.current?.end();
      callRef.current = null;
    };
  }, [attempt]);

  // 画面を離れるときにも、話した内容を保存する
  useEffect(() => () => void saveTranscript(), [saveTranscript]);

  const finish = useCallback(async () => {
    callRef.current?.end();
    callRef.current = null;
    const cid = await saveTranscript();
    if (cid) router.replace(`/chat?id=${cid}`);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [saveTranscript]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    callRef.current?.setMuted(next);
  };

  const status =
    state === 'connecting'
      ? t.voiceConnecting
      : state === 'speaking'
        ? t.voiceSpeaking
        : state === 'userSpeaking'
          ? t.voiceUserSpeaking
          : state === 'listening'
            ? t.voiceListening
            : '';
  const lastAssistant = [...turns].reverse().find((x) => x.role === 'assistant' && x.text);

  const problemText = (() => {
    if (!problem) return '';
    switch (problem.kind) {
      case 'permission':
        return t.voiceMicDenied;
      case 'unsupported':
        return t.voiceUnsupported;
      case 'dropped':
        return t.voiceDropped;
      case 'timeUp':
        return t.voiceTimeUp;
      case 'limit':
        return problem.plan === 'free'
          ? t.voiceLimitFree
              .replace('{n}', String(problem.minutes))
              .replace('{m}', String(problem.plusMinutes ?? 30))
          : t.voiceLimitPlus.replace('{n}', String(problem.minutes));
      default:
        return t.voiceCallFailed;
    }
  })();

  // 声の大きさで丸が大きくなる（話していないときはゆっくり呼吸する）
  const scale = 1 + Math.min(level, 1) * 0.35;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.top}>
        <NovaText style={styles.title}>{t.voiceMode}</NovaText>
        {left !== null && !problem ? (
          <NovaText variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {t.voiceRemaining.replace('{t}', mmss(left))}
          </NovaText>
        ) : null}
      </View>

      <View style={styles.center}>
        <View
          accessibilityRole="image"
          accessibilityLabel={status || t.voiceMode}
          style={[
            styles.orb,
            state === 'speaking' && styles.orbSpeaking,
            problem && styles.orbOff,
            { transform: [{ scale: problem ? 0.85 : scale }] },
          ]}
        />
        <NovaText style={styles.status} accessibilityLiveRegion="polite">
          {problem ? '' : status}
        </NovaText>
        {problem ? (
          <View style={styles.problem}>
            <NovaText style={styles.problemText} accessibilityRole="alert">
              {problemText}
            </NovaText>
            {problem.kind === 'limit' && problem.plan === 'free' ? (
              <Button label={t.upgradeToPlus} onPress={() => router.replace('/plans')} />
            ) : problem.kind === 'failed' || problem.kind === 'dropped' ? (
              <Button label={t.retry} onPress={() => setAttempt((n) => n + 1)} />
            ) : null}
          </View>
        ) : lastAssistant ? (
          <NovaText style={styles.caption} tone="secondary" numberOfLines={4}>
            {lastAssistant.text}
          </NovaText>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {!problem ? (
          <Pressable
            onPress={toggleMute}
            accessibilityRole="button"
            accessibilityLabel={muted ? t.voiceUnmute : t.voiceMute}
            accessibilityState={{ selected: muted }}
            style={(s) => [
              styles.round,
              styles.roundQuiet,
              muted && styles.roundMuted,
              isActive(s) && styles.pressed,
            ]}>
            <Icon name={muted ? 'micOff' : 'mic'} size={24} color={Colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void finish()}
          accessibilityRole="button"
          accessibilityLabel={problem ? t.voiceClose : t.voiceEnd}
          style={(s) => [styles.round, styles.roundEnd, isActive(s) && styles.pressed]}>
          <Icon name="close" size={26} strokeWidth={2.25} color={Colors.onAccent} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ORB = 180;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  top: { alignItems: 'center', paddingTop: Spacing.lg, gap: Spacing.xs },
  title: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.text },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: Colors.accent,
    opacity: 0.92,
    ...(Platform.OS === 'web'
      ? ({ transition: 'transform 90ms linear, opacity 200ms ease' } as object)
      : {}),
  },
  orbSpeaking: { opacity: 1 },
  orbOff: { opacity: 0.35 },
  status: { fontFamily: Fonts.medium, fontSize: 16, color: Colors.text, minHeight: 22 },
  caption: { textAlign: 'center', maxWidth: 520, fontSize: 15, lineHeight: 22 },
  problem: { alignItems: 'center', gap: Spacing.lg, maxWidth: 420 },
  problemText: { textAlign: 'center', fontSize: 15, lineHeight: 22, color: Colors.text },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  round: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundQuiet: { backgroundColor: Colors.surfaceRaised },
  roundMuted: { backgroundColor: Colors.accentMuted },
  roundEnd: { backgroundColor: Colors.accent },
  pressed: { opacity: 0.8 },
});
