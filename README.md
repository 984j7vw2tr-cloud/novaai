# NAYQO

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
| ホーム＝チャット | `src/app/index.tsx`（中身は `src/app/chat.tsx`） |
| 言語設定 | `src/app/language.tsx` |
| ログイン | `src/app/login.tsx` |
| 新規登録 | `src/app/signup.tsx` |
| 設定（アカウント・言語・データ） | `src/app/profile.tsx` |
| 会話の履歴 | `src/app/history.tsx` |
| ログイン後の戻り先 | `src/app/auth/callback.tsx` |

- 色・余白などのデザインの決まり：`src/constants/theme.ts`
- 画面に出す文言：`src/i18n/locales/`（16言語。言語ごとに1ファイル。項目は `src/i18n/types.ts`）
- 言語の切り替え・保存：`src/i18n/index.tsx`（表示言語とNAYQOの回答言語を別々に管理）
- チャットの動き（送信・停止・再生成など）：`src/hooks/use-chat.ts`
- 回答の作り方：`src/lib/nova-api.ts`（サーバーに送る）。接続先が未設定ならデモ（`src/lib/mock-reply.ts`）
- 接続先の設定：`.env.example` をコピーして `.env.local` を作る（公開してよい値だけ）

## サーバー（Supabase Edge Function `chat`）

```
supabase/functions/chat/
  index.ts          入口
  handler.ts        受付・入力チェック・回数制限・ストリーミング返信
  system-prompt.ts  NAYQOへの指示（辛口人格・カウンターモード・安全モード）
  providers/        AI会社ごとの接続（今は OpenAI。他社はここに追加）と安全チェック
```

Supabase の Edge Functions → Secrets に設定する値：

| 名前 | 内容 | 必須 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI の APIキー（**ここ以外に絶対に書かない**） | ✅ |
| `OPENAI_MODEL` | 使うモデル名（OpenAI公式のモデル一覧から選ぶ） | ✅ |
| `MAX_OUTPUT_TOKENS` | 1回の回答の長さの上限（OPENAI_API=chat のとき。既定 1500） | |
| `OPENAI_API` | `responses`（既定・ウェブ検索あり）／`chat`（以前の方式・検索なし） | |
| `MAX_OUTPUT_TOKENS_RESPONSES` | 回答の長さの上限（考える分・検索を含む。既定 8000） | |
| `WEB_SEARCH` | `off` でウェブ検索を止める（既定 on） | |
| `OPENAI_IMAGE_MODEL` | 画像を作るモデル（例 gpt-image-2） | |
| `IMAGE_LIMIT_FREE` / `IMAGE_LIMIT_PLUS` | 1日に作れる画像の枚数（既定 2 / 30） | |
| `OPENAI_REALTIME_MODEL` | 音声会話のモデル（既定 gpt-realtime-2.1-mini） | |
| `OPENAI_REALTIME_VOICE` | 音声会話の声（既定 cedar＝低めの落ち着いた男性声） | |
| `VOICE_MINUTES_FREE` / `VOICE_MINUTES_PLUS` | 1日に音声会話できる時間・分（既定 3 / 30） | |
| `RATE_LIMIT_PER_MINUTE` | 同じ接続元からの1分あたりの上限（既定 20） | |
| `ALLOWED_ORIGINS` | 呼び出しを許可するWebサイト（既定 `*`、公開時に絞る） | |
| `AI_PROVIDER` | 使うAI会社（既定 `openai`） | |
| `MODERATION` | 安全チェック（既定 `on`。`off` で停止） | |
| `OPENAI_MODERATION_MODEL` | 安全チェックのモデル（既定 `omni-moderation-latest`） | |

サーバーの設置（デプロイ）：`./scripts/deploy-function.sh chat`（アカウント削除は `account`）（Edge Functions の書き込み権限つきトークンが必要）

```bash
npm run typecheck     # アプリとサーバー両方の型チェック
npm run test:server   # サーバーの自動テスト（本物のOpenAIは呼ばない）
```

## ログイン（PHASE 7）

- 方法：メール＋パスワード / メールのログインリンク / Google / Apple（`src/auth/index.tsx`）
- ログインしていないと、ホーム・チャット・プロフィールには入れない（`src/app/_layout.tsx`）
- サーバー（chat関数）は、ログインの鍵を Supabase に確認してから答える。回数制限は人ごと
- Google / Apple のボタンは、Supabase側で有効にしたときだけ表示される

評価スクリプトはログインが必要なので、`.env.local` に `NOVA_TEST_EMAIL` / `NOVA_TEST_PASSWORD`（テスト用アカウント）を書いておく。

## デザインシステム

- 色・文字・余白・角の丸み・レイアウト：`src/constants/theme.ts`（色は黒・グレー・白・シルバーのみ）
- 文字：英字は Inter、コードは JetBrains Mono、日本語などは各OSの標準フォント（`NovaText` の `variant` で階層を指定）
- アイコン：Lucide（`src/components/icons.tsx` で太さと大きさを統一）
- 共通部品：ボタン・アイコンボタン・入力欄・お知らせ（`src/components/form.tsx`）、ページの枠と設定の行（`src/components/page-screen.tsx`）
- AIの回答：Markdown を表示（見出し・リスト・表・コード・引用。`src/components/markdown.tsx`）
- PC（幅1024px以上）はサイドバーを常に表示、スマホはメニューから引き出す（`src/components/sidebar.tsx`）

## データベース（PHASE 8）

表の定義は `supabase/migrations/` に、変更した順に置いてある。

| 表 | 中身 | 利用者ができること |
|---|---|---|
| `profiles` | 表示名・好みの言語 | 自分の分を読む・表示名と言語だけ変更 |
| `conversations` | 会話（題名・日時） | 自分の分を読む・作る・題名変更・削除 |
| `messages` | 会話の中の発言 | 自分の会話に書く・読む・削除 |
| `subscriptions` | 料金プラン（PHASE 12） | 読むだけ（書き込みはサーバー） |
| `usage_events` | AIの使用量（トークン数） | 読むだけ（書き込みはサーバー） |

- すべての表で RLS（行ごとの安全ルール）を有効にし、**他人の行は見えない・書けない**
- 会話はチャット中に自動保存（`src/hooks/use-chat.ts`, `src/lib/conversations.ts`）
- 使用量はサーバー（chat関数）がサーバー専用の鍵で記録する。会話を消しても使用量の記録は残る

```bash
NODE_USE_ENV_PROXY=1 node scripts/test-rls.mjs   # 安全ルールの確認（テスト用アカウントが必要）
```

## セキュリティ・利用制限（PHASE 9）

- **回数制限**：直近24時間の質問回数をプランごとに制限（無料 10回 / PLUS 200回 / PRO 1000回）。
  サーバーの環境変数 `QUOTA_FREE` / `QUOTA_PLUS` / `QUOTA_PRO` で変更できる（`supabase/functions/chat/quota.ts`）
- 1分あたりの回数制限（人ごと、`RATE_LIMIT_PER_MINUTE`）も別にかかる
- **データの削除**：プロフィールから「会話履歴をすべて削除」「アカウントを削除」（`supabase/functions/account`）
- **料金の把握**：`./scripts/usage-report.sh`（日ごとの使用量と推定料金）。料金は `model_prices` の表に登録する
- **プライバシーポリシー・利用規約**：`docs/` に下書き（公開前に専門家の確認が必要）

サーバーの関数は `supabase/functions/<名前>/`、共通部品は `supabase/functions/_shared/`。

## 多言語の確認

16言語で質問して、同じ言語で答えるか（簡体字・繁体字の区別、言語の切り替え、回答言語の設定、カウンターモード）を本物のAIで確認します。

```bash
NODE_USE_ENV_PROXY=1 node scripts/eval-languages.mjs
```

対応言語：英語、日本語、韓国語、中国語（簡体字・繁体字）、スペイン語、フランス語、ドイツ語、イタリア語、ポルトガル語、ロシア語、アラビア語（右から左）、ヒンディー語、インドネシア語、タイ語、ベトナム語

## 人格・カウンターモードの確認

本物のAIにテスト用の言葉を送り、ルールどおりに答えるかを自動でチェックします（料金が少しかかります）。

```bash
NODE_USE_ENV_PROXY=1 node scripts/eval-persona.mjs          # 全部
NODE_USE_ENV_PROXY=1 node scripts/eval-persona.mjs 死ね     # 名前に「死ね」を含むケースだけ
```

- カウンターモード：NAYQOへの暴言にツッコミで返す（常にON。切り替えはなし）
- 「死にたい」など自分に向いた言葉は、自動チェックで安全モードに切り替わり、茶化さずに対応する
- 回答に差別・脅し・性的な内容が入った場合は、安全な文に差し替える

### テスト用

デモ返答のとき（接続先が未設定のとき）だけ、チャットで `/error` と送ると、わざと失敗してエラー表示を確認できます。
