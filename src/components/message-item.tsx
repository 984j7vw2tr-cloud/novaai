import * as Clipboard from 'expo-clipboard';
import { memo, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/form';
import { Markdown } from '@/components/markdown';
import { NovaText } from '@/components/nova-text';
import { ThinkingIndicator } from '@/components/thinking-indicator';
import { BrandMark } from '@/components/wordmark';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { ChatMessage } from '@/lib/chat-types';

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

export const MessageItem = memo(function MessageItem({
  message,
  isLatestAssistant,
  busy,
  onRegenerate,
}: Props) {
  const { t } = useI18n();

  // ユーザーの発言：右側の吹き出し
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <NovaText style={styles.userText} selectable {...autoDir}>
            {message.content}
          </NovaText>
        </View>
      </View>
    );
  }

  // NOVAの回答：吹き出しなしで、本文として読みやすく
  const streaming = message.status === 'streaming';
  const showActions = !streaming && message.content.length > 0;

  return (
    <View style={styles.assistant}>
      <View style={styles.assistantHead}>
        <BrandMark size={14} />
        <NovaText variant="label" tone="secondary">
          NOVA
        </NovaText>
      </View>
      {streaming && message.content.length === 0 ? (
        <ThinkingIndicator />
      ) : (
        <Markdown
          content={message.content}
          labels={{ copy: t.copy, copied: t.copied }}
          trailing={streaming ? <NovaText style={styles.cursor}> ●</NovaText> : undefined}
        />
      )}
      {message.status === 'stopped' ? (
        <NovaText variant="caption" tone="muted">
          {t.stopped}
        </NovaText>
      ) : null}
      {showActions ? (
        <View style={styles.actions}>
          <CopyButton text={message.content} />
          {isLatestAssistant && !busy ? (
            <IconButton icon="regenerate" label={t.regenerate} onPress={onRegenerate} size="sm" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

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

  return (
    <IconButton
      icon={copied ? 'check' : 'copy'}
      label={copied ? t.copied : t.copy}
      onPress={copy}
      size="sm"
      color={copied ? Colors.text : Colors.textSecondary}
    />
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 22,
    paddingHorizontal: Spacing.lg + 2,
    paddingVertical: Spacing.md - 1,
  },
  userText: { ...Type.body, lineHeight: 25 },
  assistant: { gap: Spacing.md },
  // 行の先頭側に寄せる（右から左の言語では右側）
  assistantHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
  },
  cursor: { color: Colors.textMuted, fontSize: 10 },
  actions: {
    flexDirection: 'row',
    gap: 2,
    marginTop: -Spacing.xs,
    marginStart: -Spacing.sm + 2,
  },
});
