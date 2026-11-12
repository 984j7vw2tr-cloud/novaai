/**
 * 外観（テーマ）の設定。選んだテーマは端末に保存し、次に開いたときも同じ色になる。
 * Web：<html data-theme="..."> を切り替えるだけで、すぐ全体の色が変わる（色はCSS変数）。
 * スマホアプリ：保存はするが、今はダークで表示する（アプリ版の切り替えはこれから）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { Palettes, THEME_NAMES, type ThemeName } from '@/constants/theme';

export const THEME_STORAGE_KEY = 'karakuchi.theme';

const isTheme = (v: unknown): v is ThemeName => THEME_NAMES.includes(v as ThemeName);

function readWeb(): ThemeName {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

let current: ThemeName =
  Platform.OS === 'web' && typeof window !== 'undefined' ? readWeb() : 'dark';
const listeners = new Set<() => void>();

/** Web の画面に反映する（色の切り替えと、ブラウザの上の帯の色） */
function apply(name: ThemeName) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (name === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', name);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', Palettes[name].background);
}

export function getTheme(): ThemeName {
  return current;
}

export function setTheme(name: ThemeName) {
  current = name;
  apply(name);
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch {
      // 保存できなくても、今は切り替わる
    }
  } else {
    void AsyncStorage.setItem(THEME_STORAGE_KEY, name).catch(() => {});
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 今のテーマ（サーバーで作るページとずれないよう、最初はダークとして描いてから切り替える） */
export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark');
}

/** ページを開いた直後にテーマを当てる <script>（<head> に入れる。画面が一瞬ダークになるのを防ぐ） */
export function themeBootScript(): string {
  const bg = Object.fromEntries(THEME_NAMES.map((n) => [n, Palettes[n].background]));
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var bg=${JSON.stringify(bg)};if(t&&t!=='dark'&&bg[t]){document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',bg[t]);}}catch(e){}})();`;
}
