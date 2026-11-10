import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '@/components/composer';
import { MessageItem } from '@/components/message-item';
import { NovaText } from '@/components/nova-text';
import { Wordmark } from '@/components/wordmark';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { type ChatErrorKind, useChat } from '@/hooks/use-chat';
import { useI18n } from '@/i18n';
import type { Strings } from '@/i18n/types';
import type { ChatMessage } from '@/lib/chat-types';
import type { QuotaDetails } from '@/lib/nova-api';
import { isDemoMode } from '@/lib/config';
import { isActive } from '@/lib/pressable';

/** チャット画面 */
export default function ChatScreen() {
  const { q, id } = useLocalSearchParams<{ q?: string; id?: string }>();
  /** 今この画面に読み込んである（または自分で作った）会話のID */
  const shownIdRef = useRef<string | null>(null);
  const onConversationCreated = useCallback((newId: string) => {
    // 新しく保存された会話のIDをURLに入れる（再読み込みしても同じ会話が開く）
    shownIdRef.current = newId;
    router.setParams({ id: newId });
  }, []);
  const {
    messages,
    busy,
    error,
    errorDetails,
    quota,
    saveFailed,
    loading,
    loadFailed,
    send,
    stop,
    regenerate,
    retry,
    reset,
    load,
  } = useChat({ onConversationCreated });
  const { t, isRTL, uiLanguage } = useI18n();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const consumedQuery = useRef(false);

  // 履歴から開いたとき（URLに会話IDがある）は、その会話を読み込む
  useEffect(() => {
    if (typeof id !== 'string' || !id || id === shownIdRef.current) return;
    shownIdRef.current = id;
    void load(id);
  }, [id, load]);

  // ホーム画面から質問を受け取ったら、1回だけ自動で送信する
  useEffect(() => {
    if (consumedQuery.current || typeof q !== 'string' || !q.trim()) return;
    consumedQuery.current = true;
    send(q);
    // URLから質問を消しておく（再読み込みで二重に送らないため）
    router.setParams({ q: undefined });
  }, [q, send]);

  const submit = () => {
    if (!text.trim() || busy) return;
    send(text);
    setText('');
  };

  const newChat = () => {
    reset();
    shownIdRef.current = null;
    router.setParams({ id: undefined });
    setText('');
    inputRef.current?.focus();
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const latestAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <HeaderButton
          label={`${isRTL ? '›' : '‹'}  ${t.back}`}
          accessibilityLabel={t.back}
          onPress={goBack}
          compactLabel={isRTL ? '›' : '‹'}
        />
        <Wordmark size={17} />
        <HeaderButton
          label={`＋  ${t.newChat}`}
          accessibilityLabel={t.newChat}
          onPress={newChat}
          compactLabel="＋"
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.flex}
          contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
          keyboardShouldPersistTaps="handled"
          // 新しい文字が届いたら一番下までスクロール（高さの計算が終わる1フレーム後に行う）
          onContentSizeChange={() =>
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            ) : loadFailed ? (
              <View style={styles.empty} accessibilityRole="alert">
                <NovaText tone="danger" style={styles.center}>
                  {t.loadFailed}
                </NovaText>
              </View>
            ) : (
              <View style={styles.empty}>
                <NovaText variant="title" style={styles.center}>
                  {t.chatEmptyTitle}
                </NovaText>
                <NovaText variant="small" tone="secondary" style={styles.center}>
                  {t.chatEmptyBody}
                </NovaText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.column}>
              <MessageItem
                message={item}
                isLatestAssistant={item.id === latestAssistantId}
                busy={busy}
                onRegenerate={regenerate}
              />
            </View>
          )}
        />

        <View style={styles.bottom}>
          <View style={styles.column}>
            {saveFailed ? (
              <NovaText variant="caption" tone="muted" style={styles.saveNotice}>
                {t.saveFailed}
              </NovaText>
            ) : null}
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <NovaText variant="small" tone="danger" style={styles.flex}>
                  {errorMessage(error, t, errorDetails, uiLanguage)}
                </NovaText>
                {/* 回数の上限に達したときは、やり直しても同じなのでボタンを出さない */}
                {error !== 'quota_exceeded' ? (
                  <Pressable
                    onPress={retry}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                    <NovaText variant="small">{t.retry}</NovaText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {/* 残りが少なくなったら「今日の残り○回」を出す */}
            {quota && quota.remaining <= LOW_QUOTA ? (
              <NovaText variant="caption" tone="secondary" style={styles.saveNotice}>
                {t.quotaRemaining.replace('{n}', String(quota.remaining))}
              </NovaText>
            ) : null}
            <Composer
              value={text}
              onChangeText={setText}
              onSubmit={submit}
              onStop={stop}
              busy={busy}
              inputRef={inputRef}
              autoFocus={Platform.OS === 'web'}
            />
            <NovaText variant="caption" tone="muted" style={[styles.center, styles.disclaimer]}>
              {isDemoMode ? `${t.demoNotice} ・ ${t.disclaimer}` : t.disclaimer}
            </NovaText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** この回数以下になったら「今日の残り」を表示する */
const LOW_QUOTA = 10;

function errorMessage(
  kind: ChatErrorKind,
  t: Strings,
  details: QuotaDetails | null,
  locale: string,
) {
  switch (kind) {
    case 'quota_exceeded': {
      const time = details?.resetAt ? formatTime(details.resetAt, locale) : '—';
      return t.quotaExceeded
        .replace('{limit}', String(details?.limit ?? ''))
        .replace('{time}', time);
    }
    case 'network':
      return t.errorNetwork;
    case 'rate_limited':
      return t.errorRateLimited;
    case 'service_unavailable':
      return t.errorUnavailable;
    case 'invalid_request':
      return t.errorInvalid;
    case 'unauthorized':
      return t.errorUnauthorized;
    default:
      return t.errorGeneric;
  }
}

/** 次に使える時刻を、その人の言語と端末の時刻で表示する（例：11月11日 10:00） */
function formatTime(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function HeaderButton({
  label,
  accessibilityLabel,
  onPress,
  compactLabel,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  compactLabel?: string;
}) {
  // 幅の狭い画面（スマホ）では記号だけにする
  const { width } = useWindowDimensions();
  const compact = compactLabel !== undefined && width < 520;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={(state) => [styles.headerButton, isActive(state) && styles.headerButtonActive]}>
      <NovaText variant={compact ? 'body' : 'small'} tone="secondary" numberOfLines={1}>
        {compact ? compactLabel : label}
      </NovaText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    minWidth: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  headerButtonActive: { backgroundColor: Colors.surfaceRaised },
  list: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.xxl,
  },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  empty: { gap: Spacing.sm },
  center: { textAlign: 'center' },
  bottom: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.dangerSurface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  retry: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pressed: { opacity: 0.7 },
  saveNotice: { marginBottom: Spacing.sm, textAlign: 'center' },
  disclaimer: { marginTop: Spacing.sm },
});
