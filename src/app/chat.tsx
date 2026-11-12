import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '@/components/composer';
import { IconButton } from '@/components/form';
import { MessageItem } from '@/components/message-item';
import { NovaText } from '@/components/nova-text';
import { Sidebar } from '@/components/sidebar';
import { BrandMark, Wordmark } from '@/components/wordmark';
import { Breakpoints, Colors, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { useAttachmentAllowance } from '@/hooks/use-attachment-allowance';
import { useAttachmentDraft } from '@/hooks/use-attachment-draft';
import { type ChatErrorKind, useChat } from '@/hooks/use-chat';
import { useConversations } from '@/hooks/use-conversations';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useI18n } from '@/i18n';
import type { Strings } from '@/i18n/types';
import type { AttachError } from '@/lib/attachments';
import type { ChatMessage } from '@/lib/chat-types';
import { isDemoMode } from '@/lib/config';
import { confirmAsync } from '@/lib/confirm';
import type { ConversationSummary } from '@/lib/conversations';
import type { QuotaDetails } from '@/lib/nova-api';
import { isActive } from '@/lib/pressable';
import type { VoiceError } from '@/lib/voice';

/** チャット画面（Karakuchiのメイン画面。ホームもこの画面） */
export default function ChatScreen() {
  const { q, id } = useLocalSearchParams<{ q?: string; id?: string }>();
  const { t, isRTL, uiLanguage } = useI18n();
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;

  const conversations = useConversations();
  const refreshConversations = conversations.refresh;

  /** 今この画面に読み込んである（または自分で作った）会話のID */
  const shownIdRef = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onConversationCreated = useCallback(
    (newId: string) => {
      // 新しく保存された会話のIDをURLに入れる（再読み込みしても同じ会話が開く）
      shownIdRef.current = newId;
      setActiveId(newId);
      router.setParams({ id: newId });
      void refreshConversations();
    },
    [refreshConversations],
  );
  const {
    messages,
    busy,
    error,
    errorDetails,
    saveFailed,
    loading,
    loadFailed,
    send,
    stop,
    regenerate,
    retry,
    reset,
    load,
  } = useChat({
    onConversationCreated,
    attachmentTitle: (list) =>
      list.every((a) => a.kind === 'image') ? t.photo : (list[0]?.name ?? t.attachedFile),
  });

  const [text, setText] = useState('');
  const draft = useAttachmentDraft();
  const allowance = useAttachmentAllowance();
  // 無料プラン：今日の残り（送る前に付けている分も引く）
  const attachRemaining = allowance.remaining - draft.items.length;
  // 声で入力：文字になったら、入力欄の続きに入れる
  const voice = useVoiceInput(
    useCallback(
      (spoken: string) => setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken)),
      [],
    ),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const consumedQuery = useRef(false);

  // URLに会話IDがあるときは、その会話を読み込む（履歴から開いたとき・再読み込みしたとき）
  useEffect(() => {
    if (typeof id !== 'string' || !id || id === shownIdRef.current) return;
    shownIdRef.current = id;
    setActiveId(id);
    void load(id);
  }, [id, load]);

  // 以前のホーム画面のリンク（?q=質問）からも、1回だけ自動で送信できるようにしておく
  useEffect(() => {
    if (consumedQuery.current || typeof q !== 'string' || !q.trim()) return;
    consumedQuery.current = true;
    send(q);
    router.setParams({ q: undefined });
  }, [q, send]);

  // 写真・ファイルの上限でサーバーに断られたら、残りを聞き直す
  const refreshAllowance = allowance.refresh;
  useEffect(() => {
    if (error === 'attachment_limit') void refreshAllowance();
  }, [error, refreshAllowance]);

  // 回答が終わったら履歴の並び（最終更新順）を新しくする
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) void refreshConversations();
    wasBusy.current = busy;
  }, [busy, refreshConversations]);

  const submit = () => {
    if (busy || draft.uploading) return;
    if (!text.trim() && draft.ready.length === 0) return;
    const attached = draft.ready;
    if (send(text, attached)) {
      setText('');
      draft.clear();
      if (attached.length) allowance.addUsed(attached.length);
    }
  };

  const discardDraft = draft.discard;
  const newChat = useCallback(() => {
    reset();
    discardDraft();
    shownIdRef.current = null;
    setActiveId(null);
    router.setParams({ id: undefined });
    setText('');
    setDrawerOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [reset, discardDraft]);

  const selectConversation = (convId: string) => {
    setDrawerOpen(false);
    if (convId === shownIdRef.current) return;
    router.setParams({ id: convId });
  };

  const deleteFromSidebar = async (item: ConversationSummary) => {
    const ok = await confirmAsync({
      message: t.deleteConfirm,
      confirmLabel: t.deleteLabel,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    try {
      await conversations.remove(item.id);
      if (item.id === shownIdRef.current) newChat();
    } catch {
      void refreshConversations();
    }
  };

  const latestAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const empty = messages.length === 0;
  const showHero = empty && !loading && !loadFailed;

  const sidebar = (mode: 'docked' | 'drawer') => (
    <Sidebar
      mode={mode}
      items={conversations.items}
      activeId={activeId}
      onSelect={selectConversation}
      onNewChat={newChat}
      onDelete={deleteFromSidebar}
      onClose={() => (mode === 'drawer' ? setDrawerOpen(false) : setSidebarOpen(false))}
    />
  );

  const composer = (
    <Composer
      value={text}
      onChangeText={setText}
      onSubmit={submit}
      onStop={stop}
      busy={busy}
      inputRef={inputRef}
      autoFocus={Platform.OS === 'web'}
      attachments={draft.items}
      onAttach={(source) => void draft.add(source, attachRemaining)}
      attachLocked={attachRemaining <= 0 && draft.items.length === 0}
      onUpgrade={() => router.push('/plans')}
      onRemoveAttachment={draft.remove}
      attachFull={draft.full}
      voice={voice}
    />
  );

  const attachError = draft.error ? attachErrorMessage(draft.error, t) : null;
  const voiceError = voice.error ? voiceErrorMessage(voice.error, t) : null;

  const notices = (
    <>
      {attachError || voiceError ? (
        <Pressable
          onPress={() => {
            draft.clearError();
            voice.clearError();
          }}
          accessibilityRole="alert"
          style={styles.notice}>
          <NovaText variant="caption" tone="danger" style={styles.center}>
            {attachError ?? voiceError}
          </NovaText>
        </Pressable>
      ) : null}
      {saveFailed ? (
        <NovaText variant="caption" tone="muted" style={styles.notice}>
          {t.saveFailed}
        </NovaText>
      ) : null}
      {error ? (
        <View style={styles.error} accessibilityRole="alert">
          <NovaText variant="small" tone="danger" style={styles.flex}>
            {errorMessage(error, t, errorDetails, uiLanguage)}
          </NovaText>
          {/* 回数の上限に達したときは、やり直しても同じなので「プランを見る」を出す */}
          {error !== 'quota_exceeded' && error !== 'attachment_limit' ? (
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              style={(state) => [styles.retry, isActive(state) && styles.retryActive]}>
              <NovaText variant="smallMedium">{t.retry}</NovaText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/plans')}
              accessibilityRole="button"
              style={(state) => [styles.retry, isActive(state) && styles.retryActive]}>
              <NovaText variant="smallMedium">{t.seePlans}</NovaText>
            </Pressable>
          )}
        </View>
      ) : null}
    </>
  );

  // 開発用の「デモモード」のときだけ、下にお知らせを出す（本番では何も出さない）
  const demoNotice = isDemoMode ? (
    <NovaText variant="caption" tone="muted" style={styles.disclaimer}>
      {t.demoNotice}
    </NovaText>
  ) : null;

  return (
    <View style={styles.root}>
      {isDesktop && sidebarOpen ? (
        <View style={[styles.sidebarDock, isRTL ? styles.sidebarDockRTL : styles.sidebarDockLTR]}>
          {sidebar('docked')}
        </View>
      ) : null}

      <SafeAreaView style={styles.main} edges={['top', 'bottom', 'left', 'right']}>
        {/* 上の帯 */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {!isDesktop || !sidebarOpen ? (
              <IconButton
                icon={isDesktop ? 'sidebar' : 'menu'}
                label={t.openSidebar}
                onPress={() => (isDesktop ? setSidebarOpen(true) : setDrawerOpen(true))}
                isRTL={isRTL}
                flipForRTL
              />
            ) : null}
          </View>
          {!isDesktop || !sidebarOpen ? <Wordmark size={15} /> : <View />}
          <View style={[styles.headerSide, styles.headerEnd]}>
            {!isDesktop || !sidebarOpen ? (
              <IconButton icon="newChat" label={t.newChat} onPress={newChat} />
            ) : null}
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {showHero ? (
            // 最初の画面：中央にあいさつ。PCでは入力欄も中央に置く
            <ScrollView
              style={styles.flex}
              contentContainerStyle={[styles.hero, !isDesktop && styles.heroMobile]}
              keyboardShouldPersistTaps="handled">
              <View style={styles.heroInner}>
                <BrandMark size={36} />
                <NovaText variant="display" style={styles.center} accessibilityRole="header">
                  {t.homeHeadline}
                </NovaText>
                <NovaText variant="body" tone="secondary" style={styles.center}>
                  {t.homeSubline}
                </NovaText>
              </View>
              {isDesktop ? (
                <View style={styles.heroComposer}>
                  {notices}
                  {composer}
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              style={styles.flex}
              contentContainerStyle={[styles.list, empty && styles.listEmpty]}
              keyboardShouldPersistTaps="handled"
              // 新しい文字が届いたら一番下までスクロール（高さの計算が終わる1フレーム後に行う）
              onContentSizeChange={() =>
                requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
              }
              ListEmptyComponent={
                loading ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator color={Colors.textSecondary} />
                  </View>
                ) : (
                  <View style={styles.centerBox} accessibilityRole="alert">
                    <NovaText tone="danger" style={styles.center}>
                      {t.loadFailed}
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
          )}

          {/* 下の入力欄（PCの最初の画面では中央にあるので出さない） */}
          {!(showHero && isDesktop) ? (
            <View style={styles.bottom}>
              <View style={styles.column}>
                {notices}
                {composer}
                {demoNotice}
              </View>
            </View>
          ) : (
            <View style={styles.bottom}>{demoNotice}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {!isDesktop ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          isRTL={isRTL}
          closeLabel={t.closeSidebar}>
          {sidebar('drawer')}
        </Drawer>
      ) : null}
    </View>
  );
}

/** スマホのメニュー：横から引き出す。背景を押すと閉じる */
function Drawer({
  open,
  onClose,
  isRTL,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  isRTL: boolean;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(Layout.sidebarWidth + 24, width * 0.86);
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? Motion.slow : Motion.base,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, mounted, progress]);

  if (!mounted) return null;
  const offset = isRTL ? panelWidth : -panelWidth;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          isRTL ? styles.drawerRTL : styles.drawerLTR,
          { width: panelWidth, transform: [{ translateX }] },
        ]}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
          {children}
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function errorMessage(
  kind: ChatErrorKind,
  t: Strings,
  details: QuotaDetails | null,
  locale: string,
) {
  switch (kind) {
    case 'attachment_limit':
      return t.attachLimitReached;
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

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  flex: { flex: 1 },
  main: { flex: 1, backgroundColor: Colors.background },
  sidebarDock: { width: Layout.sidebarWidth, borderColor: Colors.borderSubtle },
  sidebarDockLTR: { borderRightWidth: StyleSheet.hairlineWidth },
  sidebarDockRTL: { borderLeftWidth: StyleSheet.hairlineWidth },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  headerSide: { width: 88, flexDirection: 'row' },
  headerEnd: { justifyContent: 'flex-end' },
  hero: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl * 1.5,
    gap: Spacing.xxl,
  },
  heroMobile: { paddingBottom: Spacing.xl },
  heroInner: { alignItems: 'center', gap: Spacing.md },
  heroComposer: {
    width: '100%',
    maxWidth: Layout.contentWidth,
    alignSelf: 'center',
    gap: Spacing.md,
  },
  center: { textAlign: 'center' },
  list: {
    paddingHorizontal: Spacing.lg + 4,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xxl + 4,
  },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  column: { width: '100%', maxWidth: Layout.contentWidth, alignSelf: 'center' },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxxl },
  bottom: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
  notice: { marginBottom: Spacing.sm, textAlign: 'center' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.dangerSurface,
    borderRadius: Radius.md,
    paddingStart: Spacing.lg,
    paddingEnd: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  retry: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  retryActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  disclaimer: { textAlign: 'center', marginTop: Spacing.sm },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.sidebar,
  },
  drawerLTR: { left: 0 },
  drawerRTL: { right: 0 },
});

function attachErrorMessage(code: AttachError, t: Strings) {
  switch (code) {
    case 'permission':
      return t.attachPermission;
    case 'unsupported':
      return t.attachUnsupported;
    case 'too_large':
      return t.attachTooLarge;
    case 'too_many':
      return t.attachTooMany;
    default:
      return t.attachFailed;
  }
}

function voiceErrorMessage(code: VoiceError, t: Strings) {
  if (code === 'permission') return t.voicePermission;
  if (code === 'rate_limited') return t.errorRateLimited;
  if (code === 'too_short') return null;
  return t.voiceFailed;
}
