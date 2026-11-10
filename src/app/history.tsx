import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { confirmAsync } from '@/lib/confirm';
import {
  type ConversationSummary,
  deleteConversation,
  listConversations,
} from '@/lib/conversations';
import { isActive } from '@/lib/pressable';

/** 会話の履歴：一覧・開く・削除 */
export default function HistoryScreen() {
  const { t, isRTL, uiLanguage } = useI18n();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await listConversations());
    } catch {
      setFailed(true);
    }
  }, []);

  // 画面を開くたびに最新の一覧を読む（チャットから戻ってきたときも）
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const remove = async (item: ConversationSummary) => {
    const ok = await confirmAsync({
      message: t.deleteConfirm,
      confirmLabel: t.deleteLabel,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(item.id);
    try {
      await deleteConversation(item.id);
      setItems((prev) => prev?.filter((c) => c.id !== item.id) ?? null);
    } catch {
      setFailed(true);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(uiLanguage, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={8}
          style={(state) => [styles.headerButton, isActive(state) && styles.active]}>
          <NovaText variant="small" tone="secondary">
            {`${isRTL ? '›' : '‹'}  ${t.back}`}
          </NovaText>
        </Pressable>
        <NovaText variant="small" style={styles.headerTitle} accessibilityRole="header">
          {t.historyTitle}
        </NovaText>
        <View style={styles.headerButton} />
      </View>

      {items === null && !failed ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            failed ? (
              <View style={[styles.column, styles.failed]} accessibilityRole="alert">
                <NovaText tone="danger">{t.loadFailed}</NovaText>
                <Button variant="secondary" label={t.retry} onPress={refresh} />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            failed ? undefined : (
              <NovaText tone="secondary" style={styles.emptyText}>
                {t.historyEmpty}
              </NovaText>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.column, styles.row]}>
              <Pressable
                onPress={() => router.push({ pathname: '/chat', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={item.title || t.untitled}
                style={(state) => [styles.rowMain, isActive(state) && styles.active]}>
                <NovaText numberOfLines={1}>{item.title || t.untitled}</NovaText>
                <NovaText variant="caption" tone="muted">
                  {formatDate(item.updatedAt)}
                </NovaText>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                disabled={deleting === item.id}
                accessibilityRole="button"
                accessibilityLabel={`${t.deleteLabel}: ${item.title || t.untitled}`}
                hitSlop={6}
                style={(state) => [styles.deleteButton, isActive(state) && styles.active]}>
                {deleting === item.id ? (
                  <ActivityIndicator color={Colors.textSecondary} />
                ) : (
                  <NovaText variant="caption" tone="secondary">
                    {t.deleteLabel}
                  </NovaText>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
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
    minWidth: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  headerTitle: { fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: Spacing.xs },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  failed: { gap: Spacing.md, marginBottom: Spacing.lg },
  emptyText: { textAlign: 'center', marginTop: Spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowMain: {
    flex: 1,
    gap: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  deleteButton: {
    minWidth: 56,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
  },
  active: { backgroundColor: Colors.surfaceRaised },
});
