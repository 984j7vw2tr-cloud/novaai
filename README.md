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

## 画面の構成（現在）

| 画面 | ファイル |
|---|---|
| ホーム | `src/app/index.tsx` |
| チャット | `src/app/chat.tsx` |

- 色・余白などのデザインの決まり：`src/constants/theme.ts`
- 画面に出す文言：`src/constants/strings.ts`（PHASE 6で多言語化）
- チャットの動き（送信・停止・再生成など）：`src/hooks/use-chat.ts`
- 回答の作り方：今はデモ（`src/lib/mock-reply.ts`）。PHASE 4でサーバー経由のAIに差し替える

### テスト用

チャットで `/error` と送ると、わざと失敗してエラー表示を確認できます（デモ返答のときだけ）。
