import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { ThinkingIndicator } from '@/components/thinking-indicator';
import { useI18n } from '@/i18n';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { ChatMessage } from '@/lib/chat-types';
import { isActive } from '@/lib/pressable';

type Props = {
  message: ChatMessage;
  /** 一番新しいAIの回答かどうか（再生成ボタンはこれにだけ出す） */
  isLatestAssistant: boolean;
  /** AIが回答中かどうか（回答中は再生成できない） */
  busy: boolean;
  onRegenerate: () => void;
};

/** Webで、文章の向き（アラビア語なら右から左）を中身に合わせて自動で決める */
const autoDir = (Platform.OS === 'web' ? { dir: 'auto' } : {}) as object;

export function MessageItem({ message, isLatestAssistant, busy, onRegenerate }: Props) {
  const { t } = useI18n();
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <NovaText selectable {...autoDir}>
            {message.content}
          </NovaText>
        </View>
      </View>
    );
  }

  const streaming = message.status === 'streaming';
  const showActions = !streaming && message.content.length > 0;

  return (
    <View style={styles.assistantRow}>
      <NovaText variant="label" tone="accent" style={styles.assistantLabel}>
        NOVA
      </NovaText>
      {streaming && message.content.length === 0 ? (
        <ThinkingIndicator />
      ) : (
        <NovaText selectable {...autoDir}>
          {message.content}
          {streaming ? <NovaText tone="accent">▍</NovaText> : null}
        </NovaText>
      )}
      {message.status === 'stopped' ? (
        <NovaText variant="caption" tone="muted" style={styles.stoppedNote}>
          {t.stopped}
        </NovaText>
      ) : null}
      {showActions ? (
        <View style={styles.actions}>
          <CopyButton text={message.content} />
          {isLatestAssistant && !busy ? (
            <ActionButton label={t.regenerate} onPress={onRegenerate} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return <ActionButton label={copied ? t.copied : t.copy} onPress={copy} />;
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={(state) => [styles.actionButton, isActive(state) && styles.actionButtonActive]}>
      <NovaText variant="caption" tone="secondary">
        {label}
      </NovaText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderBottomRightRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  assistantRow: { alignItems: 'stretch' },
  // 行の先頭側に寄せる（右から左の言語では右側）
  assistantLabel: { marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  stoppedNote: { marginTop: Spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    marginLeft: -Spacing.sm,
  },
  actionButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  actionButtonActive: { backgroundColor: Colors.surfaceRaised },
});
