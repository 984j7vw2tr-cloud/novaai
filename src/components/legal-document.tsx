/** 利用規約・プライバシーポリシーの画面（日本語なら日本語版、それ以外は英語版） */
import { Markdown } from '@/components/markdown';
import { PageScreen } from '@/components/page-screen';
import { useI18n } from '@/i18n';

export function LegalDocument({
  title,
  ja,
  en,
}: {
  title: string;
  ja: () => string;
  en: () => string;
}) {
  const { t, uiLanguage } = useI18n();
  return (
    <PageScreen title={title}>
      <Markdown
        content={uiLanguage === 'ja' ? ja() : en()}
        labels={{ copy: t.copy, copied: t.copied }}
      />
    </PageScreen>
  );
}
