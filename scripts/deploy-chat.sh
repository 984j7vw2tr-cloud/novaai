#!/usr/bin/env bash
# chat 関数を Supabase に設置（デプロイ）する。
# 使い方：SUPABASE_ACCESS_TOKEN=（Edge Functions の書き込み権限つきトークン） ./scripts/deploy-chat.sh
# ※OpenAI の APIキーはここでは扱わない（Supabase の Secrets に入っている）
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-nsvfgulluelraxxrlouc}"
cd "$(dirname "$0")/../supabase/functions/chat"
AUTH=()
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"); fi
curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=chat" \
  "${AUTH[@]}" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"chat","verify_jwt":false};type=application/json' \
  -F "file=@index.ts;filename=index.ts" \
  -F "file=@handler.ts;filename=handler.ts" \
  -F "file=@system-prompt.ts;filename=system-prompt.ts" \
  -F "file=@providers/index.ts;filename=providers/index.ts" \
  -F "file=@providers/openai.ts;filename=providers/openai.ts" \
  -F "file=@providers/types.ts;filename=providers/types.ts"
echo
