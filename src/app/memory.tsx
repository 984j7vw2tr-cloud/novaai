/**
 * 「NAYQOの記憶」画面：NAYQOが覚えたこと・目標・宿題を見る、1つずつ消す、全部消す、オン・オフ。
 * 書き込むのはサーバー（チャットのあと）。ここでは見る・消すだけ。
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth';
import { Button, Notice, Section } from '@/components/form';
import { Icon } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Group, ListRow, PageScreen } from '@/components/page-screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { confirmAsync } from '@/lib/confirm';
import {
  deleteAllMemories,
  deleteMemory,
  getMemoryEnabled,
  listMemories,
  type Memory,
  setMemoryEnabled,
} from '@/lib/memories';
import { isActive } from '@/lib/pressable';

export default function MemoryScreen() {
  const { t, uiLanguage } = useI18n();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<Memory[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** 期限切れかどうかを比べる時刻（読み込んだときの時刻） */
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setFailed(false);
    try {
      const [list, on] = await Promise.all([listMemories(), getMemoryEnabled(userId)]);
      setItems(list);
      setEnabled(on);
      setNow(Date.now());
    } catch {
      setFailed(true);
    }
  }, [userId]);

  // 画面を開くたびに最新を読む
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const toggle = async () => {
    if (!userId || enabled === null) return;
    setBusy('toggle');
    try {
      await setMemoryEnabled(userId, !enabled);
      setEnabled(!enabled);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: Memory) => {
    setBusy(m.id);
    try {
      await deleteMemory(m.id);
      setItems((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const removeAll = async () => {
    if (!userId) return;
    const ok = await confirmAsync({
      message: t.memoryDeleteAllConfirm,
      confirmLabel: t.deleteLabel,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('all');
    try {
      await deleteAllMemories(userId);
      setItems([]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const date = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(uiLanguage, { month: 'short', day: 'numeric' }).format(
        new Date(iso),
      );
    } catch {
      return iso.slice(5, 10);
    }
  };

  const tasks = (items ?? []).filter((m) => m.kind === 'task');
  const openTasks = tasks.filter((m) => m.status === 'open');
  const closedTasks = tasks.filter((m) => m.status !== 'open');
  const known = (items ?? []).filter((m) => m.kind !== 'task');

  const taskBadge = (m: Memory): { text: string; strong?: boolean } | null => {
    if (m.status === 'done') return { text: t.memoryDone, strong: true };
    if (m.status === 'failed') return { text: t.memoryFailed };
    if (m.status === 'dropped') return { text: t.memoryDropped };
    if (!m.dueAt) return null;
    return Date.parse(m.dueAt) <= now
      ? { text: t.memoryOverdue, strong: true }
      : { text: t.memoryDue.replace('{d}', date(m.dueAt)) };
  };

  const row = (m: Memory, label: string, badge: { text: string; strong?: boolean } | null) => (
    <View key={m.id} style={styles.item}>
      <View style={styles.itemText}>
        <NovaText
          style={[styles.content, m.kind === 'task' && m.status !== 'open' && styles.closed]}>
          {label}
        </NovaText>
        {badge ? (
          <NovaText
            variant="caption"
            tone={badge.strong ? undefined : 'muted'}
            style={badge.strong ? styles.badgeStrong : undefined}>
            {badge.text}
          </NovaText>
        ) : null}
      </View>
      <Pressable
        onPress={() => void remove(m)}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel={`${t.deleteLabel}: ${m.content}`}
        hitSlop={8}
        style={(s) => [styles.trash, isActive(s) && styles.trashActive]}>
        {busy === m.id ? (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        ) : (
          <Icon name="trash" size={18} color={Colors.textMuted} />
        )}
      </Pressable>
    </View>
  );

  return (
    <PageScreen title={t.memoryTitle}>
      <NovaText tone="secondary" style={styles.intro}>
        {t.memoryIntro}
      </NovaText>

      {failed ? <Notice tone="danger" text={t.actionFailed} /> : null}

      <Group>
        <ListRow
          first
          icon="memory"
          label={t.memoryUse}
          value={enabled === null ? '' : enabled ? t.memoryOn : t.memoryOff}
          onPress={() => void toggle()}
          busy={busy === 'toggle'}
          disabled={enabled === null || !!busy}
        />
      </Group>
      {enabled === false ? (
        <NovaText variant="caption" tone="muted">
          {t.memoryOffNote}
        </NovaText>
      ) : null}

      {items === null && !failed ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : items && items.length === 0 ? (
        <NovaText tone="muted" style={styles.empty}>
          {t.memoryEmpty}
        </NovaText>
      ) : (
        <>
          {tasks.length ? (
            <Section title={t.memoryHomework}>
              <View style={styles.list}>
                {openTasks.map((m) => row(m, m.content, taskBadge(m)))}
                {closedTasks.map((m) => row(m, m.content, taskBadge(m)))}
              </View>
            </Section>
          ) : null}
          {known.length ? (
            <Section title={t.memoryKnows}>
              <View style={styles.list}>
                {known.map((m) =>
                  row(
                    m,
                    m.kind === 'goal' ? t.memoryGoal.replace('{s}', m.content) : m.content,
                    null,
                  ),
                )}
              </View>
            </Section>
          ) : null}
          <Button
            variant="secondary"
            icon="trash"
            label={t.memoryDeleteAll}
            onPress={() => void removeAll()}
            busy={busy === 'all'}
            disabled={!!busy}
          />
        </>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  intro: { lineHeight: 22 },
  center: { paddingVertical: Spacing.xxl, alignItems: 'center' },
  empty: { lineHeight: 22, textAlign: 'center', paddingVertical: Spacing.xl },
  list: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    marginTop: -StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1, gap: 2 },
  content: { fontSize: 15, lineHeight: 21, color: Colors.text },
  closed: { color: Colors.textSecondary },
  badgeStrong: { color: Colors.text, fontWeight: '600' },
  trash: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashActive: { backgroundColor: Colors.surfaceRaised },
});
