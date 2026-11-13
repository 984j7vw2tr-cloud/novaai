/** 利用規約 */
import { LegalDocument } from '@/components/legal-document';
import { useI18n } from '@/i18n';
import { termsEn, termsJa } from '@/legal/documents';

export default function TermsScreen() {
  const { t } = useI18n();
  return <LegalDocument title={t.termsTitle} ja={termsJa} en={termsEn} />;
}
