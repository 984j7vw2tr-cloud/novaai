import type { AuthErrorKind } from '@/auth';
import type { Strings } from '@/i18n/types';

/** ログインのエラーの種類 → 画面に出す文 */
export function authErrorMessage(kind: AuthErrorKind, t: Strings) {
  switch (kind) {
    case 'invalid':
      return t.authErrorInvalid;
    case 'notConfirmed':
      return t.authErrorNotConfirmed;
    case 'exists':
      return t.authErrorExists;
    case 'weakPassword':
      return t.authErrorWeakPassword;
    case 'email':
      return t.authErrorEmail;
    case 'rateLimit':
      return t.authErrorRateLimit;
    case 'provider':
      return t.authErrorProvider;
    default:
      return t.authErrorGeneric;
  }
}

/** 文の中の {email} を実際のメールアドレスに置き換える */
export const withEmail = (template: string, email: string) => template.replace('{email}', email);

/** 送信前の簡単なチェック（細かい判定はSupabase側で行う） */
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
