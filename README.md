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
- 回答の作り方：`src/lib/nova-api.ts`（サーバーに送る）。接続先が未設定ならデモ（`src/lib/mock-reply.ts`）
- 接続先の設定：`.env.example` をコピーして `.env.local` を作る（公開してよい値だけ）

## サーバー（Supabase Edge Function `chat`）

```
supabase/functions/chat/
  index.ts          入口
  handler.ts        受付・入力チェック・回数制限・ストリーミング返信
  system-prompt.ts  NOVAへの指示（PHASE 5で人格を追加）
  providers/        AI会社ごとの接続（今は OpenAI。他社はここに追加）
```

Supabase の Edge Functions → Secrets に設定する値：

| 名前 | 内容 | 必須 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI の APIキー（**ここ以外に絶対に書かない**） | ✅ |
| `OPENAI_MODEL` | 使うモデル名（OpenAI公式のモデル一覧から選ぶ） | ✅ |
| `MAX_OUTPUT_TOKENS` | 1回の回答の長さの上限（既定 1500） | |
| `RATE_LIMIT_PER_MINUTE` | 同じ接続元からの1分あたりの上限（既定 20） | |
| `ALLOWED_ORIGINS` | 呼び出しを許可するWebサイト（既定 `*`、公開時に絞る） | |
| `AI_PROVIDER` | 使うAI会社（既定 `openai`） | |

```bash
npm run typecheck     # アプリとサーバー両方の型チェック
npm run test:server   # サーバーの自動テスト（本物のOpenAIは呼ばない）
```

### テスト用

デモ返答のとき（接続先が未設定のとき）だけ、チャットで `/error` と送ると、わざと失敗してエラー表示を確認できます。
