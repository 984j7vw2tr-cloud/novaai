import { ar } from './locales/ar';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { id } from './locales/id';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { th } from './locales/th';
import { vi } from './locales/vi';
import { zhHans } from './locales/zh-Hans';
import { zhHant } from './locales/zh-Hant';
import type { Strings } from './types';

/** 対応している言語（表示言語・回答言語の両方で使う） */
export const LANGUAGES = [
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    rtl: false,
    strings: en,
  },
  {
    code: 'ja',
    nativeName: '日本語',
    englishName: 'Japanese',
    rtl: false,
    strings: ja,
  },
  {
    code: 'ko',
    nativeName: '한국어',
    englishName: 'Korean',
    rtl: false,
    strings: ko,
  },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    rtl: false,
    strings: zhHans,
  },
  {
    code: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Chinese (Traditional)',
    rtl: false,
    strings: zhHant,
  },
  {
    code: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    rtl: false,
    strings: es,
  },
  {
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    rtl: false,
    strings: fr,
  },
  {
    code: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    rtl: false,
    strings: de,
  },
  {
    code: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    rtl: false,
    strings: it,
  },
  {
    code: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
    rtl: false,
    strings: pt,
  },
  {
    code: 'ru',
    nativeName: 'Русский',
    englishName: 'Russian',
    rtl: false,
    strings: ru,
  },
  {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    rtl: true,
    strings: ar,
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    rtl: false,
    strings: hi,
  },
  {
    code: 'id',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    rtl: false,
    strings: id,
  },
  {
    code: 'th',
    nativeName: 'ไทย',
    englishName: 'Thai',
    rtl: false,
    strings: th,
  },
  {
    code: 'vi',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
    rtl: false,
    strings: vi,
  },
] as const satisfies readonly {
  code: string;
  nativeName: string;
  englishName: string;
  rtl: boolean;
  strings: Strings;
}[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** 端末の言語が対応外のときに使う言語 */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export function getLanguage(code: LanguageCode) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

/**
 * 端末の言語タグ（例："ja-JP", "zh-Hant-TW", "zh-HK", "pt-BR"）を、対応言語に合わせる。
 * 対応していなければ null。
 */
export function matchLanguageTag(tag: string | null | undefined): LanguageCode | null {
  if (!tag) return null;
  const parts = tag.replace(/_/g, '-').split('-');
  const lang = parts[0].toLowerCase();
  if (lang === 'zh') {
    const rest = parts.slice(1).map((p) => p.toLowerCase());
    // 繁体字：Hant と書かれている、または台湾・香港・マカオ
    if (rest.includes('hant') || rest.some((p) => ['tw', 'hk', 'mo'].includes(p))) return 'zh-Hant';
    return 'zh-Hans';
  }
  if (lang === 'in') return 'id'; // 古いインドネシア語のコード
  return isLanguageCode(lang) ? lang : null;
}
