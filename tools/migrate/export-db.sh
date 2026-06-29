#!/usr/bin/env bash
#
# export-db.sh — one-time database clone: Lovable Cloud (SOURCE) -> our owned Supabase (TARGET).
# Mechanics adapted from the Dreamlit open-source exporter, scoped down for LNN Hub.
#
# ⚠️ DRAFT — NOT YET RUN. Test each phase against the real projects (on a throwaway target first)
#    before trusting it. The auth-schema handling in Phase 2 is the part most likely to need
#    adjustment for the target's GoTrue version — see README.md ("If auth data load fails").
#
# WHAT IT DOES
#   Phase 0  pre-create source Postgres extensions on the target
#   Phase 1  copy the app schema(s) structure (tables, sequences, RLS, triggers, functions)
#   Phase 2  copy the data for app schema(s) + auth (minus ephemeral tables), with FK checks /
#            triggers / RLS disabled during load (session_replication_role = replica)
#   Phase 3  re-sync sequences to MAX(owning column) as a safety net
#   Storage is handled separately by copy-storage.ts (objects move over the Storage REST API).
#
# PREREQS: pg_dump + psql (Postgres client 15+, matching the source major version) on PATH.
#
# ENV (export these; never hardcode secrets):
#   SOURCE_DB_URL   from the migrate-helper response (Lovable Cloud DB URL).
#                   If it resolves IPv6-only, use the Session pooler URL instead.
#   TARGET_DB_URL   new Supabase project → Connect → Session pooler (or Direct) connection string.
#   PGSSLMODE       defaults to "require".
#
# USAGE:  SOURCE_DB_URL=... TARGET_DB_URL=... ./export-db.sh --confirm-target-blank

set -euo pipefail

APP_SCHEMAS=(public)   # add any custom app schemas here (Supabase/Lovable apps usually use only public)
AUTH_EXCLUDE=(sessions refresh_tokens flow_state one_time_tokens audit_log_entries mfa_amr_claims saml_relay_states schema_migrations)
export PGSSLMODE="${PGSSLMODE:-require}"

: "${SOURCE_DB_URL:?set SOURCE_DB_URL (from migrate-helper)}"
: "${TARGET_DB_URL:?set TARGET_DB_URL (new Supabase project connection string)}"

if [[ "${1:-}" != "--confirm-target-blank" ]]; then
  echo "Refusing to run without --confirm-target-blank." >&2
  echo "The TARGET must be a brand-new, empty Supabase project. This load is all-or-nothing;" >&2
  echo "if it fails, reset the target project and re-run." >&2
  exit 2
fi

echo "==> Confirming the target project is blank..."
pub_tables=$(psql "$TARGET_DB_URL" -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
auth_users=$(psql "$TARGET_DB_URL" -tAc "select count(*) from auth.users;" 2>/dev/null || echo 0)
if [[ "${pub_tables:-0}" != "0" || "${auth_users:-0}" != "0" ]]; then
  echo "Target is NOT blank (public tables=$pub_tables, auth.users=$auth_users). Reset it and retry." >&2
  exit 3
fi

echo "==> Confirming the target role may set session_replication_role..."
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -c "set session_replication_role=replica; reset session_replication_role;" >/dev/null

echo "==> Phase 0: pre-create source extensions on the target..."
psql "$SOURCE_DB_URL" -tAc "select extname from pg_extension where extname <> 'plpgsql';" \
| while read -r ext; do
    [[ -z "$ext" ]] && continue
    if psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -c "create extension if not exists \"$ext\" cascade;" >/dev/null 2>&1; then
      echo "    extension ok: $ext"
    else
      echo "    WARN: could not create extension '$ext' (may be managed/unavailable) — review manually"
    fi
  done

echo "==> Phase 1: copy app schema structure: ${APP_SCHEMAS[*]}"
schema_args=(); for s in "${APP_SCHEMAS[@]}"; do schema_args+=(--schema="$s"); done
pg_dump "$SOURCE_DB_URL" --schema-only --no-owner --no-privileges "${schema_args[@]}" \
  | psql "$TARGET_DB_URL" --single-transaction -v ON_ERROR_STOP=1

echo "==> Phase 2: copy data (app schema(s) + auth, minus ephemeral) with FK/triggers/RLS disabled"
data_args=(); for s in "${APP_SCHEMAS[@]}"; do data_args+=(--schema="$s"); done
data_args+=(--schema=auth)
excl_args=(); for t in "${AUTH_EXCLUDE[@]}"; do excl_args+=(--exclude-table-data="auth.${t}"); done

# Stream the dump through a FIFO so a large dump is never staged to disk.
fifo="$(mktemp -u)"; mkfifo "$fifo"
trap 'rm -f "$fifo"' EXIT
( pg_dump "$SOURCE_DB_URL" --data-only --no-owner --no-privileges "${data_args[@]}" "${excl_args[@]}" > "$fifo" ) &
{
  echo "set session_replication_role = replica;"
  cat "$fifo"
} | psql "$TARGET_DB_URL" --single-transaction -v ON_ERROR_STOP=1
wait

echo "==> Phase 3: re-sync sequences (safety net; harmless if pg_dump already set them)"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record; maxv bigint;
begin
  for r in
    select n.nspname as schema, s.relname as seq, t.relname as tbl, a.attname as col
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype = 'a'
    join pg_class t on t.oid = d.refobjid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S' and n.nspname = 'public'
  loop
    execute format('select coalesce(max(%I),0) from %I.%I', r.col, r.schema, r.tbl) into maxv;
    execute format('select setval(%L, greatest(%s,1), %L)', r.schema||'.'||r.seq, maxv, maxv > 0);
  end loop;
end $$;
SQL

echo "==> Database clone complete. Next: run copy-storage.ts, then verify.sh."
