import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
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
import { strings } from '@/constants/strings';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useChat } from '@/hooks/use-chat';
import type { ChatMessage } from '@/lib/chat-types';
import { isActive } from '@/lib/pressable';

/** チャット画面 */
export default function ChatScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { messages, busy, error, send, stop, regenerate, retry, reset } = useChat();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const consumedQuery = useRef(false);

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
        <HeaderButton label={`‹  ${strings.back}`} onPress={goBack} compactLabel="‹" />
        <Wordmark size={17} />
        <HeaderButton label={`＋  ${strings.newChat}`} onPress={newChat} compactLabel="＋" />
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
            <View style={styles.empty}>
              <NovaText variant="title" style={styles.center}>
                {strings.chatEmptyTitle}
              </NovaText>
              <NovaText variant="small" tone="secondary" style={styles.center}>
                {strings.chatEmptyBody}
              </NovaText>
            </View>
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
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <NovaText variant="small" tone="danger" style={styles.flex}>
                  {strings.errorGeneric}
                </NovaText>
                <Pressable
                  onPress={retry}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                  <NovaText variant="small">{strings.retry}</NovaText>
                </Pressable>
              </View>
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
              {strings.demoNotice} ・ {strings.disclaimer}
            </NovaText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HeaderButton({
  label,
  onPress,
  compactLabel,
}: {
  label: string;
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
      accessibilityLabel={label.replace(/^[‹＋]\s*/, '')}
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
  bottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
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
  disclaimer: { marginTop: Spacing.sm },
});
