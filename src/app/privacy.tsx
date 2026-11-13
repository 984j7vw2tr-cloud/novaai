/** プライバシーポリシー */
import { LegalDocument } from '@/components/legal-document';
import { useI18n } from '@/i18n';
import { privacyEn, privacyJa } from '@/legal/documents';

export default function PrivacyScreen() {
  const { t } = useI18n();
  return <LegalDocument title={t.privacyTitle} ja={privacyJa} en={privacyEn} />;
}
