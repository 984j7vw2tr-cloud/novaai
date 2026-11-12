/**
 * サイドバー：新しいチャット・会話の履歴・設定。
 * PCでは画面の左（右から左の言語では右）に常に表示し、スマホではメニューとして引き出す。
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth';
import { IconButton } from '@/components/form';
import { Icon } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, isLightTheme, Radius, Spacing } from '@/constants/theme';
import { groupByDate } from '@/hooks/use-conversations';
import { useI18n } from '@/i18n';
import type { ConversationSummary } from '@/lib/conversations';
import { isActive } from '@/lib/pressable';
import { getProfile } from '@/lib/profile';
import { useTheme } from '@/lib/theme-store';

type Props = {
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (item: ConversationSummary) => void;
  /** 閉じる（スマホ）／たたむ（PC） */
  onClose: () => void;
  mode: 'docked' | 'drawer';
};

export function Sidebar({ items, activeId, onSelect, onNewChat, onDelete, onClose, mode }: Props) {
  const { t, isRTL } = useI18n();
  const theme = useTheme();
  const groups = groupByDate(items);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        {/* NAYQO のロゴ。明るいテーマでは黒いカードに載せて読みやすくする */}
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="NAYQO">
          {isLightTheme(theme) ? (
            <Image
              source={require('@/assets/images/nayqo-logo-card.png')}
              style={[styles.logo, styles.logoCard]}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require('@/assets/images/nayqo-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          )}
        </View>
        <IconButton
          icon={mode === 'drawer' ? 'close' : 'sidebar'}
          label={t.closeSidebar}
          onPress={onClose}
          isRTL={isRTL}
          flipForRTL
        />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <NovaText variant="caption" tone="muted" style={styles.groupTitle}>
              {t[group.key]}
            </NovaText>
            {group.items.map((item) => (
              <ConversationRow
                key={item.id}
                item={item}
                title={item.title || t.untitled}
                active={item.id === activeId}
                onPress={() => onSelect(item.id)}
                onDelete={() => onDelete(item)}
                deleteLabel={`${t.deleteLabel}: ${item.title || t.untitled}`}
              />
            ))}
          </View>
        ))}
        {items.length > 0 ? (
          <Pressable
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            style={(state) => [styles.viewAll, isActive(state) && styles.rowActive]}>
            <NovaText variant="caption" tone="secondary">
              {t.viewAllHistory}
            </NovaText>
          </Pressable>
        ) : null}
      </ScrollView>

      <UserFooter onNewChat={onNewChat} />
    </View>
  );
}

/** 会話の1行。マウスを乗せる（スマホでは選択中）と削除ボタンが出る */
function ConversationRow({
  item,
  title,
  active,
  onPress,
  onDelete,
  deleteLabel,
}: {
  item: ConversationSummary;
  title: string;
  active: boolean;
  onPress: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  const showDelete = hovered || active || Platform.OS !== 'web';
  return (
    // 行全体（題名のボタン＋削除ボタンを横に並べる。ボタンの中にボタンを入れない）
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessible={false}
      style={[styles.conv, active && styles.convActive, !active && hovered && styles.rowActive]}>
      {/* 選択中の会話には、先頭に細い赤い線 */}
      {active ? <View style={styles.convMarker} /> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-current={active ? 'page' : undefined}
        nativeID={`conv-${item.id}`}
        style={styles.convTitle}>
        <NovaText variant="small" tone={active ? 'primary' : 'secondary'} numberOfLines={1}>
          {title}
        </NovaText>
      </Pressable>
      {showDelete ? (
        <View style={styles.convDelete}>
          <IconButton icon="trash" label={deleteLabel} onPress={onDelete} size="sm" />
        </View>
      ) : null}
    </Pressable>
  );
}

/** 下の部分：左＝ログイン中の人（押すと設定）、右＝えんじ色の「チャット」（新しいチャットを始めて、すぐ入力できる） */
function UserFooter({ onNewChat }: { onNewChat: () => void }) {
  const { t } = useI18n();
  const { session, authRequired } = useAuth();
  const userId = session?.user.id;
  const email = session?.user.email ?? '';
  const [name, setName] = useState('');

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getProfile(userId)
      .then((p) => {
        if (active && p?.displayName) setName(p.displayName);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  if (!authRequired) return null;
  const label = name || email;
  const initial = (label.trim()[0] ?? 'N').toUpperCase();

  return (
    <View style={styles.footer}>
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel={t.settings}
        style={(state) => [styles.user, isActive(state) && styles.rowActive]}>
        <View style={styles.avatar}>
          <NovaText variant="smallMedium">{initial}</NovaText>
        </View>
        <View style={styles.flex}>
          <NovaText variant="smallMedium" numberOfLines={1}>
            {label}
          </NovaText>
          <NovaText variant="caption" tone="muted" numberOfLines={1}>
            {t.settings}
          </NovaText>
        </View>
      </Pressable>
      <Pressable
        onPress={onNewChat}
        accessibilityRole="button"
        accessibilityLabel={t.chatButton}
        style={(state) => [styles.newChatPill, isActive(state) && styles.newChatPillActive]}>
        <Icon name="newChat" size={16} color={Colors.onAccent} strokeWidth={2.25} />
        <NovaText variant="smallMedium" style={styles.newChatText} numberOfLines={1}>
          {t.chatButton}
        </NovaText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.sidebar },
  flex: { flex: 1 },
  top: {
    minHeight: 56,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: Spacing.lg,
    paddingEnd: Spacing.sm,
  },
  brand: { paddingTop: 2 },
  logo: { width: 176, height: 89 },
  logoCard: { borderRadius: Radius.md },
  pad: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md - 2,
  },
  rowActive: { backgroundColor: Colors.surface },
  scroll: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.lg },
  group: { gap: 1 },
  groupTitle: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs + 2,
  },
  conv: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    paddingEnd: Spacing.xs,
    borderRadius: Radius.md - 2,
  },
  convTitle: { flex: 1, minHeight: 38, justifyContent: 'center', paddingStart: Spacing.md },
  convActive: { backgroundColor: Colors.surfaceRaised },
  convMarker: {
    position: 'absolute',
    start: 0,
    top: 10,
    bottom: 10,
    width: 2,
    borderRadius: 1,
    backgroundColor: Colors.accent,
  },
  convDelete: { marginVertical: -4 },
  viewAll: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  user: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  newChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    height: 40,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
  },
  newChatPillActive: { opacity: 0.85 },
  newChatText: { color: Colors.onAccent },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
