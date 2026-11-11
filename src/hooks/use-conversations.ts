import { useCallback, useEffect, useState } from 'react';

import { isDemoMode } from '@/lib/config';
import {
  type ConversationSummary,
  deleteConversation,
  listConversations,
} from '@/lib/conversations';

/** サイドバーの会話一覧（読み込み・更新・削除） */
export function useConversations() {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (isDemoMode) return;
    try {
      setItems(await listConversations());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  // 最初に1回読み込む（読み込みが終わってから画面の状態を更新する）
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    listConversations()
      .then((list) => {
        if (!active) return;
        setItems(list);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { items, loaded, failed, refresh, remove };
}

export type ConversationGroup = {
  key: 'today' | 'previous7Days' | 'older';
  items: ConversationSummary[];
};

/** 「今日」「過去7日間」「それ以前」に分ける */
export function groupByDate(items: ConversationSummary[], now = new Date()): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
  const groups: ConversationGroup[] = [
    { key: 'today', items: [] },
    { key: 'previous7Days', items: [] },
    { key: 'older', items: [] },
  ];
  for (const item of items) {
    const t = Date.parse(item.updatedAt);
    if (t >= startOfToday) groups[0].items.push(item);
    else if (t >= weekAgo) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}
