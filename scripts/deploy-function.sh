#!/usr/bin/env bash
# Supabase の Edge Function を設置（デプロイ）する。共通部品（_shared）も一緒に送る。
# 使い方：./scripts/deploy-function.sh chat      （または account）
# 必要なもの：Edge Functions の書き込み権限つきのアクセストークン
#   （SUPABASE_ACCESS_TOKEN 環境変数。この開発環境では自動で付与される）
# ※OpenAI の APIキーなどの秘密はここでは扱わない（Supabase の Secrets に入っている）
set -euo pipefail
NAME="${1:?関数の名前を指定してください（例：chat）}"
REF="${SUPABASE_PROJECT_REF:-nsvfgulluelraxxrlouc}"
cd "$(dirname "$0")/../supabase/functions"
[ -f "${NAME}/index.ts" ] || { echo "${NAME}/index.ts がありません"; exit 1; }
AUTH=()
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"); fi
# 関数のフォルダと _shared の、テスト以外の .ts ファイルをすべて送る
FILES=()
while IFS= read -r f; do FILES+=(-F "file=@${f};filename=${f}"); done < <(
  find "${NAME}" _shared -name '*.ts' ! -name '*.test.ts' 2>/dev/null | sort
)
curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${NAME}" \
  "${AUTH[@]}" \
  -F "metadata={\"entrypoint_path\":\"${NAME}/index.ts\",\"name\":\"${NAME}\",\"verify_jwt\":false};type=application/json" \
  "${FILES[@]}"
echo
