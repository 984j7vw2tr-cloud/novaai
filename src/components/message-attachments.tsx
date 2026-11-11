/** 発言に付いた写真・ファイルの表示（写真は縮小表示、ファイルは名前と大きさ） */
import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { attachmentUrl, cachedAttachmentUrl, formatBytes } from '@/lib/attachments';
import type { Attachment } from '@/lib/chat-types';

const MAX_W = 240;
const MAX_H = 260;

export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind === 'file');
  const many = images.length > 1;
  return (
    <View style={styles.root}>
      {images.length ? (
        <View style={styles.images}>
          {images.map((a) => (
            <AttachmentImage key={a.path} attachment={a} square={many} />
          ))}
        </View>
      ) : null}
      {files.map((a) => (
        <AttachmentFile key={a.path} attachment={a} />
      ))}
    </View>
  );
}

/** 表示用のURL（本人だけが使える期限付きURL）を用意する */
function useUrl(path: string) {
  const [url, setUrl] = useState<string | null>(() => cachedAttachmentUrl(path));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    let active = true;
    attachmentUrl(path).then((u) => {
      if (!active) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [path, url]);
  return { url, failed };
}

const open = (url: string | null) => {
  if (!url) return;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else void Linking.openURL(url);
};

function AttachmentImage({ attachment, square }: { attachment: Attachment; square: boolean }) {
  const { url, failed } = useUrl(attachment.path);
  let width = MAX_W;
  let height = 180;
  if (square) {
    width = 120;
    height = 120;
  } else if (attachment.width && attachment.height) {
    const scale = Math.min(MAX_W / attachment.width, MAX_H / attachment.height, 1);
    width = Math.round(attachment.width * scale);
    height = Math.round(attachment.height * scale);
  }
  return (
    <Pressable
      onPress={() => open(url)}
      accessibilityRole="imagebutton"
      accessibilityLabel={attachment.name}
      style={[styles.image, { width, height }]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Icon name="image" size={22} color={failed ? Colors.textMuted : Colors.textSecondary} />
        </View>
      )}
    </Pressable>
  );
}

function AttachmentFile({ attachment }: { attachment: Attachment }) {
  const { url } = useUrl(attachment.path);
  const ext = (attachment.name.split('.').pop() ?? '').toUpperCase();
  return (
    <Pressable
      onPress={() => open(url)}
      accessibilityRole="link"
      accessibilityLabel={attachment.name}
      style={styles.file}>
      <View style={styles.fileIcon}>
        <Icon name="file" size={18} color={Colors.onAccent} />
      </View>
      <View style={styles.fileText}>
        <NovaText variant="smallMedium" numberOfLines={1}>
          {attachment.name}
        </NovaText>
        <NovaText variant="caption" tone="muted" numberOfLines={1}>
          {[ext, formatBytes(attachment.size)].filter(Boolean).join(' · ')}
        </NovaText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.sm, alignItems: 'flex-end' },
  images: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.xs + 2,
    maxWidth: 250,
  },
  image: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    width: 260,
    maxWidth: '100%',
    padding: Spacing.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
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
  fileText: { flex: 1, gap: 2 },
});
