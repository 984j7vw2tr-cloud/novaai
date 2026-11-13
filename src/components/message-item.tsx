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
};

/** Webで、文章の向き（アラビア語なら右から左）を中身に合わせて自動で決める */
const autoDir = (Platform.OS === 'web' ? { dir: 'auto' } : {}) as object;

export const MessageItem = memo(function MessageItem({ message }: Props) {
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
        <ThinkingIndicator
          label={
            message.pending === 'image'
              ? t.generatingImage
              : message.pending === 'search'
                ? t.searchingWeb
                : undefined
          }
        />
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
          {/* 回答の下はコピーだけ（再生成ボタンはなし） */}
          <CopyButton text={message.content} />
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
