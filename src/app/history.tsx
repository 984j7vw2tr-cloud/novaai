import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { PageScreen } from '@/components/page-screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
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
  const { t, uiLanguage } = useI18n();
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

  return (
    <PageScreen title={t.historyTitle} scroll={false}>
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
                onPress={() => router.push({ pathname: '/', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={item.title || t.untitled}
                style={(state) => [styles.rowMain, isActive(state) && styles.active]}>
                <NovaText numberOfLines={1}>{item.title || t.untitled}</NovaText>
                <NovaText variant="caption" tone="muted">
                  {formatDate(item.updatedAt)}
                </NovaText>
              </Pressable>
              {deleting === item.id ? (
                <View style={styles.deleteButton}>
                  <ActivityIndicator color={Colors.textSecondary} />
                </View>
              ) : (
                <IconButton
                  icon="trash"
                  label={`${t.deleteLabel}: ${item.title || t.untitled}`}
                  onPress={() => remove(item)}
                />
              )}
            </View>
          )}
        />
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: 2 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  failed: { gap: Spacing.md, marginBottom: Spacing.lg },
  emptyText: { textAlign: 'center', marginTop: Spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  rowMain: {
    flex: 1,
    gap: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  deleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: Colors.surface },
});
