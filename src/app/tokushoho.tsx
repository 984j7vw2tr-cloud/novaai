/**
 * 特定商取引法に基づく表記（日本の法律で、有料サービスを売るときに載せる必要がある情報）。
 * 日本の法律のページなので、どの表示言語でも日本語で載せる。
 * 運営者の氏名・住所・電話番号は「請求があれば遅滞なく開示する」形にしている。
 */
import { StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { PageScreen } from '@/components/page-screen';
import { Colors, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

import { OPERATOR } from '@/legal/operator';

/** 問い合わせ先のメールアドレス（src/legal/operator.ts で設定。空なら「準備中」と表示） */
const CONTACT_EMAIL = OPERATOR.contactEmail;

const DISCLOSE = '請求があれば遅滞なく開示します。';

const ROWS: [string, string][] = [
  ['販売事業者', DISCLOSE],
  ['運営責任者', DISCLOSE],
  ['所在地', DISCLOSE],
  ['電話番号', DISCLOSE],
  ['メールアドレス', CONTACT_EMAIL || '準備中'],
  ['サービス名', 'NAYQO'],
  [
    '販売価格',
    'PLUS プラン：月額480円（税抜）／528円（税込）\n各プランの価格は「料金プラン」画面に表示しています。',
  ],
  ['商品代金以外の必要料金', 'インターネット接続料金・通信料金はお客様のご負担となります。'],
  [
    'お支払い方法',
    'Web：クレジットカード（決済は Stripe により処理されます）\niPhoneアプリ：App Store の決済\nAndroidアプリ：Google Play の決済',
  ],
  [
    'お支払い時期',
    'お申し込み時に初回の料金をお支払いいただき、以後は1か月ごとに自動で更新・請求されます。',
  ],
  ['サービスの提供時期', 'お支払いの完了後、すぐにご利用いただけます。'],
  [
    '解約について',
    'いつでも解約できます。Webでお申し込みの場合は「料金プラン」画面の「プランの変更・解約」から、アプリでお申し込みの場合は App Store または Google Play の定期購入の設定から解約してください。解約後も、お支払い済みの期間の終わりまでご利用いただけ、次回以降の請求は発生しません。',
  ],
  [
    '返品・返金について',
    'デジタルサービスの性質上、お支払い済みの料金の返金には応じておりません。ただし、当社の責めに帰すべき事由によりサービスを提供できなかった場合はこの限りではありません。',
  ],
  [
    '動作環境',
    '最新版の主要なブラウザ（Safari・Chrome・Edge・Firefox）、iPhoneアプリ、Androidアプリ',
  ],
];

export default function LegalScreen() {
  const { t } = useI18n();
  return (
    <PageScreen title={t.legalNotice}>
      <View style={styles.table} accessibilityRole="list">
        {ROWS.map(([label, value], i) => (
          <View key={label} style={[styles.row, i === 0 && styles.first]} accessibilityRole="text">
            <NovaText variant="smallMedium" tone="secondary" style={styles.label}>
              {label}
            </NovaText>
            <NovaText variant="small" style={styles.value} selectable>
              {value}
            </NovaText>
          </View>
        ))}
      </View>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  first: { borderTopWidth: 0 },
  label: { width: 168, flexShrink: 0 },
  value: { flex: 1, minWidth: 200, lineHeight: 22 },
});
