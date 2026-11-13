/** 料金プラン画面：FREE・PLUS・PRO を並べ、申し込み（Stripe）・変更・解約へ進む */
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Button, Notice } from '@/components/form';
import { Icon } from '@/components/icons';
import { LegalLinks } from '@/components/legal-links';
import { NovaText } from '@/components/nova-text';
import { PageScreen } from '@/components/page-screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import {
  type BillingStatus,
  getBillingStatus,
  openPortal,
  type PaidPlan,
  type PlanId,
  startCheckout,
} from '@/lib/billing';

/**
 * Stripe（Web）での申し込み・管理ボタンを出すか。
 * アプリ（iPhone・Android）では、App Store・Google Play の決済を使う決まりなので、
 * そちらを組み込むまで申し込みボタンは出さない（プランの内容と、今のプランだけ表示）。
 */
const WEB_BILLING = Platform.OS === 'web';

const PLAN_LABEL: Record<PlanId, string> = { free: 'FREE', plus: 'PLUS', pro: 'PLUS' };

export default function PlansScreen() {
  const { t, uiLanguage } = useI18n();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<PaidPlan | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const s = await getBillingStatus(true);
      setStatus(s);
      setLoadFailed(false);
      return s;
    } catch {
      setLoadFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    getBillingStatus(true)
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // 支払いから戻ってきた直後は、Stripe からの知らせが届くまで数秒待って何度か読み直す
  useEffect(() => {
    if (checkout !== 'success') return;
    const run = ++pollRef.current;
    let tries = 0;
    const tick = async () => {
      if (run !== pollRef.current || tries++ > 10) return;
      const s = await load();
      if (s && s.plan === 'free') setTimeout(tick, 2000);
    };
    void tick();
  }, [checkout, load]);

  const go = async (action: PaidPlan | 'portal') => {
    setError(null);
    setBusy(action);
    try {
      const { url } = action === 'portal' ? await openPortal() : await startCheckout(action);
      if (Platform.OS === 'web') {
        window.location.assign(url);
        return; // ページが切り替わる
      }
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === 'billing_unavailable' ? t.billingUnavailable : t.billingError);
    } finally {
      setBusy(null);
    }
  };

  const yen = (n: number) =>
    new Intl.NumberFormat(uiLanguage, { style: 'currency', currency: 'JPY' }).format(n);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(uiLanguage, { dateStyle: 'medium' }).format(new Date(iso));

  // 以前の PRO 契約は PLUS として表示する
  const count = (n: number) => n.toLocaleString(uiLanguage);
  /** プランの説明：回数（無制限なら「無制限」）と、写真・ファイルの数 */
  const features = (id: 'free' | 'plus') => {
    if (!status) return [];
    const chat = status.limits[id];
    const files = status.attachmentLimits[id];
    const images = status.imageLimits?.[id];
    const voice = status.voiceMinutes?.[id];
    return [
      chat === null ? t.planChatUnlimited : t.perDayMessages.replace('{n}', count(chat)),
      files === null ? t.planFilesUnlimited : t.planFilesPerDay.replace('{n}', count(files)),
      ...(images !== undefined ? [t.planImagesPerDay.replace('{n}', count(images))] : []),
      ...(voice !== undefined ? [t.planVoicePerDay.replace('{n}', count(voice))] : []),
    ];
  };
  const current: 'free' | 'plus' = status && status.plan !== 'free' ? 'plus' : 'free';
  const paid = current !== 'free';

  return (
    <PageScreen title={t.plans}>
      <View style={styles.intro}>
        <NovaText variant="body" tone="secondary">
          {t.plansSubtitle}
        </NovaText>
        {status?.mode === 'test' ? (
          <View style={styles.testBadge} accessibilityRole="text">
            <NovaText variant="caption" style={styles.testText}>
              {t.billingTestMode}
            </NovaText>
          </View>
        ) : null}
      </View>

      {checkout === 'success' ? <Notice tone="info" text={t.checkoutSuccess} /> : null}
      {checkout === 'cancel' ? <Notice tone="info" text={t.checkoutCanceled} /> : null}
      {error ? <Notice tone="danger" text={error} /> : null}
      {loadFailed ? <Notice tone="danger" text={t.loadFailed} /> : null}

      {!status && !loadFailed ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.textSecondary} />
        </View>
      ) : null}

      {status ? (
        <View style={styles.cards}>
          {(['free', 'plus'] as const).map((id) => {
            const isCurrent = current === id;
            const highlight = id === 'plus';
            return (
              <View
                key={id}
                style={[
                  styles.card,
                  highlight && styles.cardHighlight,
                  isCurrent && styles.cardCurrent,
                ]}
                accessibilityLabel={`${PLAN_LABEL[id]} ${isCurrent ? t.currentPlan : ''}`}>
                <View style={styles.cardHead}>
                  <NovaText variant="label" tone={highlight ? 'accent' : 'secondary'}>
                    {PLAN_LABEL[id]}
                  </NovaText>
                  {isCurrent ? (
                    <View style={styles.currentBadge}>
                      <NovaText variant="caption">{t.currentPlan}</NovaText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.priceRow}>
                  <NovaText variant="title">
                    {id === 'free' ? t.priceFree : yen(status.prices[id])}
                  </NovaText>
                  {id !== 'free' ? (
                    <NovaText variant="small" tone="muted">
                      {t.perMonth}
                    </NovaText>
                  ) : null}
                </View>
                {id !== 'free' && status.pricesWithTax ? (
                  // 総額表示：税込の金額も必ず出す
                  <NovaText variant="caption" tone="muted" style={styles.taxLine}>
                    {t.priceWithTax.replace('{price}', yen(status.pricesWithTax[id]))}
                  </NovaText>
                ) : null}
                {features(id).map((f) => (
                  <Feature key={f} text={f} />
                ))}

                {isCurrent && paid && status.currentPeriodEnd ? (
                  <NovaText variant="caption" tone="muted">
                    {(status.cancelAtPeriodEnd ? t.endsOn : t.renewsOn).replace(
                      '{date}',
                      date(status.currentPeriodEnd),
                    )}
                  </NovaText>
                ) : null}

                {WEB_BILLING && id !== 'free' && !isCurrent && !paid ? (
                  <Button
                    label={t.choosePlan.replace('{plan}', PLAN_LABEL[id])}
                    variant={highlight ? 'primary' : 'secondary'}
                    onPress={() => go(id)}
                    busy={busy === id}
                    disabled={busy !== null || status.mode === 'off'}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {WEB_BILLING && status && (paid || status.manageable) ? (
        <Button
          label={t.managePlan}
          variant="secondary"
          onPress={() => go('portal')}
          busy={busy === 'portal'}
          disabled={busy !== null || status.mode === 'off' || !status.manageable}
        />
      ) : null}

      <NovaText variant="caption" tone="muted" style={styles.note}>
        {t.billingNote}
      </NovaText>
      <LegalLinks align="start" />
    </PageScreen>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={styles.feature}>
      <Icon name="check" size={16} color={Colors.accentText} strokeWidth={2.25} />
      <NovaText variant="small" tone="secondary" style={styles.flex}>
        {text}
      </NovaText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: Spacing.md, marginBottom: Spacing.sm },
  testBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
  },
  testText: { color: Colors.accentText },
  loading: { paddingVertical: Spacing.xxl, alignItems: 'center' },
  cards: { gap: Spacing.md },
  card: {
    gap: Spacing.md,
    padding: Spacing.lg + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardHighlight: { borderColor: Colors.accentMuted },
  cardCurrent: { borderColor: Colors.accent },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentBadge: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceRaised,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  note: { marginTop: Spacing.md },
  taxLine: { marginTop: -Spacing.sm },
});
