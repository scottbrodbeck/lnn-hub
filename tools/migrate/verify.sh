#!/usr/bin/env bash
#
# verify.sh — post-migration sanity check: compare row counts SOURCE vs TARGET for every public
# table, plus auth.users. This is the data half of the go/no-go gate; the other half is a real
# user login test (password + magic-link OTP) done manually in the app.
#
# ENV:  SOURCE_DB_URL, TARGET_DB_URL  (PGSSLMODE defaults to require)
# USAGE: SOURCE_DB_URL=... TARGET_DB_URL=... ./verify.sh

set -euo pipefail
: "${SOURCE_DB_URL:?set SOURCE_DB_URL}"
: "${TARGET_DB_URL:?set TARGET_DB_URL}"
export PGSSLMODE="${PGSSLMODE:-require}"

list_sql="select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;"

mismatches=0
printf "%-40s %12s %12s   %s\n" "public table" "source" "target" "status"
printf -- "------------------------------------------------------------------------------\n"
while read -r tbl; do
  [[ -z "$tbl" ]] && continue
  s=$(psql "$SOURCE_DB_URL" -tAc "select count(*) from public.\"$tbl\";")
  t=$(psql "$TARGET_DB_URL" -tAc "select count(*) from public.\"$tbl\";")
  if [[ "$s" == "$t" ]]; then status="ok"; else status="*** MISMATCH ***"; mismatches=$((mismatches+1)); fi
  printf "%-40s %12s %12s   %s\n" "$tbl" "$s" "$t" "$status"
done < <(psql "$SOURCE_DB_URL" -tAc "$list_sql")

su=$(psql "$SOURCE_DB_URL" -tAc "select count(*) from auth.users;")
tu=$(psql "$TARGET_DB_URL" -tAc "select count(*) from auth.users;")
printf -- "------------------------------------------------------------------------------\n"
printf "%-40s %12s %12s   %s\n" "auth.users" "$su" "$tu" "$([[ "$su" == "$tu" ]] && echo ok || echo '*** MISMATCH ***')"
[[ "$su" == "$tu" ]] || mismatches=$((mismatches+1))

echo
if [[ "$mismatches" -eq 0 ]]; then
  echo "All row counts match. Now do the manual login smoke test (password + OTP) before cutover."
else
  echo "$mismatches mismatch(es) found — investigate before trusting this migration." >&2
  exit 1
fi
