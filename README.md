# NOVA AI

ONE AI. EVERY LANGUAGE. NO FILTER.

A multilingual general-purpose AI assistant focused on honest, direct, and helpful conversations.

## 技術構成

- Expo SDK 58 / React Native / TypeScript
- Expo Router（画面は `src/app/` に置く）
- バックエンド（予定）：Supabase + Edge Functions
- AI（予定）：OpenAI API（他社モデルにも切り替えられる構造）

## 動かし方

```bash
npm install        # 最初の1回だけ。必要な部品をダウンロード
npm run web        # ブラウザで表示
npm start          # スマホのExpo Goアプリで表示（QRコードを読み取る）
```

## チェック

```bash
npx tsc --noEmit   # 型チェック（TypeScriptの間違い探し）
npx expo lint      # コードの書き方チェック
```
