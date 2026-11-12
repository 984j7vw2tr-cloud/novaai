import { type Ref, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type HostInstance,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import type { AttachSource, DraftItem } from '@/hooks/use-attachment-draft';
import type { VoiceState } from '@/hooks/use-voice-input';
import { useI18n } from '@/i18n';
import { isActive } from '@/lib/pressable';

type Voice = {
  state: VoiceState;
  seconds: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  /** 回答中に「停止」を押したとき */
  onStop?: () => void;
  /** AIが考え中・回答中かどうか。true のときは送信ボタンが停止ボタンになる */
  busy?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<TextInputInstance>;
  /** 送信前の添付（写真・ファイル） */
  attachments?: DraftItem[];
  onAttach?: (source: AttachSource) => void;
  onRemoveAttachment?: (id: string) => void;
  /** これ以上付けられない */
  attachFull?: boolean;
  /** 声で入力 */
  voice?: Voice;
  /** 無料プランで、今日の写真・ファイルの上限に達している */
  attachLocked?: boolean;
  /** 「PLUSにアップグレード」を押したとき */
  onUpgrade?: () => void;
};

const BUTTON = 36;
const LINE = 24;
const MIN_HEIGHT = LINE + 16;
const MAX_HEIGHT = 220;
const THUMB = 60;
const MENU_WIDTH = 300;

/** Web で、触って操作する端末（スマホ・タブレット）か。PCではカメラの項目を出さない */
const isTouchWeb =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** メッセージ入力欄：＋（写真・ファイル）／入力／マイク・送信（停止）ボタン */
export function Composer({
  value,
  onChangeText,
  onSubmit,
  onStop,
  busy,
  autoFocus,
  inputRef,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  attachFull,
  voice,
  attachLocked = false,
  onUpgrade,
}: Props) {
  const window = useWindowDimensions();
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const plusRef = useRef<HostInstance>(null);
  // Web では入力欄が自動で伸びないので、文字の量に合わせて高さを計算する
  const [webHeight, setWebHeight] = useState(MIN_HEIGHT);
  // 送信して空になったら、1行の高さに戻す
  if (Platform.OS === 'web' && value === '' && webHeight !== MIN_HEIGHT) {
    setWebHeight(MIN_HEIGHT);
  }

  const uploading = attachments.some((a) => a.status === 'uploading');
  const hasReady = attachments.some((a) => a.status === 'ready');
  const recording = voice?.state === 'recording';
  const transcribing = voice?.state === 'transcribing';
  const hasContent = value.trim().length > 0 || hasReady;
  const canSend = hasContent && !busy && !uploading && !recording && !transcribing;

  const submit = () => {
    if (canSend) onSubmit();
  };

  // Web（PC）では Enter で送信、Shift+Enter で改行。
  // 日本語入力の変換確定の Enter では送信しない。
  const handleKeyPress = (e: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const ev = e.nativeEvent as TextInputKeyPressEvent['nativeEvent'] & {
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    };
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  };

  const openMenu = () => {
    plusRef.current?.measureInWindow((x: number, y: number) => setMenu({ x, y }));
  };
  const choose = (source: AttachSource) => {
    setMenu(null);
    // メニューが閉じてから選ぶ画面を開く（iPhoneで画面が重なって開かないのを防ぐ）
    setTimeout(() => onAttach?.(source), Platform.OS === 'ios' ? 350 : 0);
  };

  const menuItems: { source: AttachSource; icon: IconName; label: string }[] = [
    ...(Platform.OS !== 'web' || isTouchWeb
      ? [{ source: 'camera' as const, icon: 'camera' as const, label: t.attachCamera }]
      : []),
    { source: 'library', icon: 'image', label: t.attachPhoto },
    { source: 'file', icon: 'file', label: t.attachFile },
  ];

  // 右側のボタン：回答中＝停止／録音中＝止めて文字にする／内容あり＝送信／空＝マイク
  let action;
  if (busy) {
    action = (
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel={t.stop}
        style={(state) => [styles.button, styles.buttonOn, isActive(state) && styles.pressed]}>
        {/* 停止：塗りつぶしの四角 */}
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Rect x={0} y={0} width={12} height={12} rx={2.5} fill={Colors.onAccent} />
        </Svg>
      </Pressable>
    );
  } else if (recording) {
    action = (
      <Pressable
        onPress={voice?.stop}
        accessibilityRole="button"
        accessibilityLabel={t.voiceStop}
        style={(state) => [styles.button, styles.buttonOn, isActive(state) && styles.pressed]}>
        <Icon name="check" size={18} strokeWidth={2.5} color={Colors.onAccent} />
      </Pressable>
    );
  } else if (transcribing) {
    action = (
      <View style={[styles.button, styles.buttonOff]}>
        <ActivityIndicator size="small" color={Colors.textSecondary} />
      </View>
    );
  } else if (!hasContent && voice) {
    action = (
      <Pressable
        onPress={voice.start}
        accessibilityRole="button"
        accessibilityLabel={t.voiceInput}
        style={(state) => [
          styles.button,
          styles.buttonGhost,
          isActive(state) && styles.ghostPressed,
        ]}>
        <Icon name="mic" size={20} color={Colors.text} />
      </Pressable>
    );
  } else {
    action = (
      <Pressable
        onPress={submit}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={t.send}
        aria-disabled={!canSend}
        style={(state) => [
          styles.button,
          canSend ? styles.buttonOn : styles.buttonOff,
          canSend && isActive(state) && styles.pressed,
        ]}>
        {uploading ? (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        ) : (
          <Icon
            name="send"
            size={18}
            strokeWidth={2.25}
            color={canSend ? Colors.onAccent : Colors.textMuted}
          />
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      {attachments.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tray}
          keyboardShouldPersistTaps="handled">
          {attachments.map((a) => (
            <DraftThumb
              key={a.id}
              item={a}
              removeLabel={`${t.removeAttachment}: ${a.name}`}
              uploadingLabel={t.uploading}
              onRemove={() => onRemoveAttachment?.(a.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.row}>
        {onAttach ? (
          <View ref={plusRef} collapsable={false}>
            <Pressable
              onPress={openMenu}
              disabled={attachFull || recording || transcribing}
              accessibilityRole="button"
              accessibilityLabel={t.attach}
              aria-disabled={attachFull || recording || transcribing}
              aria-haspopup="menu"
              aria-expanded={Boolean(menu)}
              {...(Platform.OS === 'web' ? { title: t.attach } : null)}
              style={(state) => [
                styles.button,
                styles.buttonGhost,
                isActive(state) && styles.ghostPressed,
                (attachFull || recording || transcribing) && styles.dim,
              ]}>
              <Icon name="plus" size={22} color={Colors.text} />
            </Pressable>
          </View>
        ) : null}

        {recording || transcribing ? (
          <View style={styles.recording} accessibilityLiveRegion="polite">
            {recording ? <View style={styles.recDot} /> : null}
            <NovaText variant="small" tone="secondary" style={styles.flex} numberOfLines={1}>
              {recording
                ? `${t.voiceRecording}  ${mmss(voice?.seconds ?? 0)}`
                : t.voiceTranscribing}
            </NovaText>
            {recording ? (
              <Pressable
                onPress={voice?.cancel}
                accessibilityRole="button"
                accessibilityLabel={t.voiceCancel}
                style={(state) => [styles.small, isActive(state) && styles.ghostPressed]}>
                <Icon name="close" size={18} color={Colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.input, Platform.OS === 'web' && { height: webHeight }]}
            {...(Platform.OS === 'web' ? { rows: 1 } : null)}
            onContentSizeChange={(e) => {
              if (Platform.OS !== 'web') return;
              const h = Math.min(
                MAX_HEIGHT,
                Math.max(MIN_HEIGHT, e.nativeEvent.contentSize.height),
              );
              setWebHeight(h);
            }}
            value={value}
            onChangeText={onChangeText}
            placeholder={t.composerPlaceholder}
            placeholderTextColor={Colors.textMuted}
            multiline
            autoFocus={autoFocus}
            onKeyPress={handleKeyPress}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            selectionColor={Colors.accent}
            textAlignVertical="center"
            accessibilityLabel={t.composerPlaceholder}
          />
        )}

        {action}
      </View>

      {/* ＋のメニュー（カメラ・写真・ファイル）。無料プランの上限に達したら、お知らせとアップグレードを出す */}
      <Modal
        visible={Boolean(menu)}
        transparent
        animationType="none"
        onRequestClose={() => setMenu(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setMenu(null)}
          accessibilityRole="button"
          accessibilityLabel={t.cancel}>
          {menu ? (
            <View
              accessibilityRole="menu"
              style={[
                styles.menu,
                {
                  left: Math.max(
                    Spacing.sm,
                    Math.min(menu.x - 4, window.width - MENU_WIDTH - Spacing.sm),
                  ),
                  // ＋ボタンのすぐ上に出す（下の端をそろえる）
                  bottom: Math.max(Spacing.sm, window.height - menu.y + 14),
                },
              ]}>
              {attachLocked ? (
                <>
                  <NovaText variant="body" style={styles.menuMessage}>
                    {t.attachLimitReached}
                  </NovaText>
                  <Pressable
                    onPress={() => {
                      setMenu(null);
                      onUpgrade?.();
                    }}
                    accessibilityRole="menuitem"
                    accessibilityLabel={t.upgradeToPlus}
                    style={(state) => [styles.menuItem, isActive(state) && styles.menuItemActive]}>
                    <View style={styles.menuIcon}>
                      <Icon name="sparkle" size={22} color={Colors.accentText} strokeWidth={2} />
                    </View>
                    <NovaText variant="bodyMedium" style={styles.upgradeText}>
                      {t.upgradeToPlus}
                    </NovaText>
                  </Pressable>
                </>
              ) : null}
              {menuItems.map((m) => (
                <Pressable
                  key={m.source}
                  onPress={() => choose(m.source)}
                  disabled={attachLocked}
                  accessibilityRole="menuitem"
                  accessibilityLabel={m.label}
                  aria-disabled={attachLocked}
                  style={(state) => [
                    styles.menuItem,
                    !attachLocked && isActive(state) && styles.menuItemActive,
                    attachLocked && styles.menuItemOff,
                  ]}>
                  <View style={styles.menuIcon}>
                    <Icon name={m.icon} size={20} color={Colors.text} />
                  </View>
                  <NovaText variant="bodyMedium">{m.label}</NovaText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

/** 入力欄の上の、送信前の添付1つ（写真はサムネイル、ファイルは名前） */
function DraftThumb({
  item,
  removeLabel,
  uploadingLabel,
  onRemove,
}: {
  item: DraftItem;
  removeLabel: string;
  uploadingLabel: string;
  onRemove: () => void;
}) {
  const failed = item.status === 'error';
  return (
    <View style={styles.thumbWrap}>
      {item.kind === 'image' ? (
        <Image
          source={{ uri: item.previewUri }}
          style={[styles.thumb, failed && styles.thumbFailed]}
          accessibilityLabel={item.name}
        />
      ) : (
        <View style={[styles.fileChip, failed && styles.thumbFailed]}>
          <View style={styles.fileIcon}>
            <Icon name="file" size={18} color={Colors.onAccent} />
          </View>
          <NovaText variant="caption" numberOfLines={2} style={styles.fileName}>
            {item.name}
          </NovaText>
        </View>
      )}
      {item.status === 'uploading' ? (
        <View style={styles.thumbOverlay} accessibilityLabel={uploadingLabel}>
          <ActivityIndicator size="small" color={Colors.text} />
        </View>
      ) : null}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        hitSlop={8}
        style={styles.remove}>
        <Icon name="close" size={12} strokeWidth={2.5} color={Colors.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 28,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  containerFocused: { borderColor: Colors.focus },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs },
  flex: { flex: 1 },
  tray: { gap: Spacing.sm, paddingHorizontal: Spacing.xs, paddingTop: Spacing.xs },
  input: {
    ...Type.body,
    flex: 1,
    minHeight: MIN_HEIGHT - 4,
    maxHeight: MAX_HEIGHT,
    lineHeight: LINE,
    color: Colors.text,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: 6,
    paddingHorizontal: 2,
    writingDirection: 'auto',
  },
  recording: {
    flex: 1,
    minHeight: BUTTON,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  small: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOn: { backgroundColor: Colors.accent },
  buttonOff: { backgroundColor: Colors.surfaceRaised },
  buttonGhost: { backgroundColor: 'transparent' },
  ghostPressed: { backgroundColor: Colors.surfaceRaised },
  pressed: { opacity: 0.82 },
  dim: { opacity: 0.4 },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    maxWidth: '92%',
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }
      : { elevation: 10, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20 }),
  },
  menuMessage: {
    paddingHorizontal: Spacing.xl - 4,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    color: Colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md + 2,
    minHeight: 60,
    paddingHorizontal: Spacing.lg,
  },
  menuItemActive: { backgroundColor: Colors.border },
  menuItemOff: { opacity: 0.38 },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  upgradeText: { color: Colors.accentText, flex: 1 },
  thumbWrap: { position: 'relative', paddingTop: 6, paddingEnd: 6 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
  },
  thumbFailed: { borderWidth: 1.5, borderColor: Colors.danger, opacity: 0.6 },
  thumbOverlay: {
    position: 'absolute',
    top: 6,
    start: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  fileChip: {
    height: THUMB,
    width: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  fileName: { flex: 1, color: Colors.text },
  remove: {
    position: 'absolute',
    top: 0,
    end: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.text,
  },
});
