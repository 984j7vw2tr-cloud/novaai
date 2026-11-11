#!/usr/bin/env bash
# 運営者用：日ごとの使用量と推定料金（直近30日）を表示する。
# 料金は model_prices の表に登録した値で計算する（未登録のモデルは cost_usd が空）。
# 料金の登録例（Supabase の SQL Editor で実行。数字は OpenAI 公式の料金表で確認すること）：
#   insert into model_prices (model, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok)
#   values ('モデル名', 入力単価, キャッシュ入力単価, 出力単価)
#   on conflict (model) do update set input_usd_per_mtok = excluded.input_usd_per_mtok,
#     cached_input_usd_per_mtok = excluded.cached_input_usd_per_mtok,
#     output_usd_per_mtok = excluded.output_usd_per_mtok, updated_at = now();
# 必要なもの：Supabase のアクセストークン（この開発環境では自動で付与される）
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-nsvfgulluelraxxrlouc}"
AUTH=()
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"); fi
QUERY="select day, model, requests, users, input_tokens, cached_input_tokens, output_tokens, cost_usd,
  round(input_tokens::numeric / nullif(requests, 0)) as avg_input_per_request
  from public.usage_daily_costs where day >= current_date - 30 order by day desc, model"
curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/${REF}/database/query" \
  "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$QUERY")" |
  python3 -c '
import json, sys
rows = json.load(sys.stdin)
if not rows:
    print("（まだ使用量の記録がありません）"); sys.exit()
cols = ["day","model","requests","users","input_tokens","cached_input_tokens","output_tokens","cost_usd","avg_input_per_request"]
print("\t".join(cols))
for r in rows:
    print("\t".join("" if r.get(c) is None else str(r.get(c)) for c in cols))
'
