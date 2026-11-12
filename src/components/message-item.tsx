import * as Clipboard from 'expo-clipboard';
import { memo, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/form';
import { Markdown } from '@/components/markdown';
import { MessageAttachments } from '@/components/message-attachments';
import { NovaText } from '@/components/nova-text';
import { ThinkingIndicator } from '@/components/thinking-indicator';
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
        {message.attachments?.length ? (
          <MessageAttachments attachments={message.attachments} />
        ) : null}
        {message.content ? (
          <View style={styles.userBubble}>
            <NovaText style={styles.userText} selectable {...autoDir}>
              {message.content}
            </NovaText>
          </View>
        ) : null}
      </View>
    );
  }

  // NAYQOの回答：吹き出しなしで、本文として読みやすく
  const streaming = message.status === 'streaming';
  const showActions = !streaming && message.content.length > 0;

  return (
    <View style={styles.assistant}>
      {/* AIが作った画像 */}
      {message.attachments?.length ? (
        <MessageAttachments attachments={message.attachments} align="start" />
      ) : null}
      {streaming && message.content.length === 0 ? (
        <ThinkingIndicator label={message.pending === 'image' ? t.generatingImage : undefined} />
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
  userRow: { alignItems: 'flex-end', gap: Spacing.sm },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 22,
    paddingHorizontal: Spacing.lg + 2,
    paddingVertical: Spacing.md - 1,
  },
  userText: { ...Type.body, lineHeight: 25 },
  assistant: { gap: Spacing.md },
  // 回答が流れている間の、文の最後のえんじ色の〇
  cursor: { color: Colors.accent, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    gap: 2,
    marginTop: -Spacing.xs,
    marginStart: -Spacing.sm + 2,
  },
});
