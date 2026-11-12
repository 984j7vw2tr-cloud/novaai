import { useCallback, useEffect, useState } from 'react';

import { getBillingStatus } from '@/lib/billing';

/**
 * 今日あと何回、写真・ファイルを付けられるか（無料プランは1日3回。PLUS は無制限）。
 * 正しい数はサーバーが数えている。ここでは画面の表示（＋メニューの「上限です」）に使う。
 */
export function useAttachmentAllowance() {
  const [limit, setLimit] = useState<number | null>(null);
  const [used, setUsed] = useState(0);
  /** 今のプラン（読み込むまでは null） */
  const [plan, setPlan] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getBillingStatus();
      setLimit(s.attachments.limit);
      setUsed(s.attachments.used);
      setPlan(s.plan);
    } catch {
      // 調べられないときは制限しない（送ったときにサーバーが判定する）
    }
  }, []);

  // 最初に1回読む（effect の中で直接 setState しないよう、結果が届いてから書き込む）
  useEffect(() => {
    let active = true;
    getBillingStatus()
      .then((s) => {
        if (!active) return;
        setLimit(s.attachments.limit);
        setUsed(s.attachments.used);
        setPlan(s.plan);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /** 送ったぶんを先に足しておく（サーバーに聞き直すまでの間も正しく表示するため） */
  const addUsed = useCallback((n: number) => setUsed((u) => u + n), []);

  const remaining = limit === null ? Infinity : Math.max(0, limit - used);
  return { limit, used, remaining, plan, refresh, addUsed };
}
