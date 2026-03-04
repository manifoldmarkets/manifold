#!/bin/bash
# Initialize the Manifold database schema from scratch.
# Fixes known syntax bugs in auto-generated SQL and applies files in dependency order.
set -uo pipefail

# PSQL can be overridden for docker exec usage:
#   export PSQL="docker exec -i manifold-db psql -U postgres -d postgres"
if [ -z "${PSQL:-}" ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
  DB_PORT="${POSTGRES_PORT:-5432}"
  PSQL="psql -h 127.0.0.1 -p $DB_PORT -U postgres -d postgres"
fi

apply_sql() {
  local file="$1"
  # Fix known autogen bugs (two separate sed passes so the multi-line rule
  # in the second pass doesn't prevent substitutions in the first pass):
  #   Pass 1: simple substitutions applied to every line
  #     - "constraint primary key" → "primary key" (missing constraint name)
  #     - "leakproof" requires superuser — strip it for local dev
  #   Pass 2: multi-line trailing-comma fix (N reads next line, so it must
  #           run after pass 1 to avoid skipping lines)
  # Note: grep matches both "psql:file:line: ERROR" (file mode) and "ERROR:"
  # (stdin/pipe mode) so errors are never silently swallowed.
  sed \
    -e 's/constraint primary key/primary key/g' \
    -e 's/ leakproof//g' \
    "$file" \
  | sed -e '/,$/{ N; s/,\n[[:space:]]*);/\n  );/; }' \
  | $PSQL -f - 2>&1 | grep -iE "^(psql|ERROR)" || true
}

# Like apply_sql but skips the multi-line trailing-comma fix.
# Use for functions.sql — function bodies contain legitimate ",\n  );"
# patterns in SQL queries that the trailing-comma rule would corrupt.
apply_functions_sql() {
  local file="$1"
  sed \
    -e 's/constraint primary key/primary key/g' \
    -e 's/ leakproof//g' \
    "$file" \
  | $PSQL -f - 2>&1 | grep -iE "^(psql|ERROR)" || true
}

SCHEMA_DIR="backend/supabase"

echo "==> Phase 1: seed.sql (extensions, roles, text search configs)"
cat "$SCHEMA_DIR/seed.sql" | $PSQL -f - 2>&1 | grep -iE "^(psql|ERROR)" || true

echo ""
echo "==> Phase 2: functions.sql (helper functions — some will fail, re-applied later)"
apply_functions_sql "$SCHEMA_DIR/functions.sql"
echo "  (second pass for inter-function dependencies)"
apply_functions_sql "$SCHEMA_DIR/functions.sql"

echo ""
echo "==> Phase 3: Create missing enum types"
$PSQL -c "DO \$\$ BEGIN CREATE TYPE status_type AS ENUM ('new', 'under review', 'resolved', 'needs admin'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" 2>&1 | grep -iE "^(psql|ERROR)" || true

echo ""
echo "==> Phase 4: Core tables"
for f in users.sql private_users.sql contracts.sql txns.sql; do
  echo "  $f"
  apply_sql "$SCHEMA_DIR/$f"
done

echo ""
echo "==> Phase 5: All remaining schema files"
for f in "$SCHEMA_DIR"/*.sql; do
  base=$(basename "$f")
  case "$base" in
    seed.sql|functions.sql|users.sql|private_users.sql|contracts.sql|txns.sql|achievement_materialized_views.sql)
      continue ;;
  esac
  echo "  $base"
  apply_sql "$f"
done

echo ""
echo "==> Phase 6: Re-apply functions.sql (now that all tables exist)"
apply_functions_sql "$SCHEMA_DIR/functions.sql"

echo ""
echo "==> Phase 7: Re-apply schema files (now that functions like firebase_uid() exist)"
echo "  (core tables first to satisfy foreign key dependencies)"
for f in users.sql private_users.sql contracts.sql txns.sql; do
  apply_sql "$SCHEMA_DIR/$f"
done
for f in "$SCHEMA_DIR"/*.sql; do
  base=$(basename "$f")
  case "$base" in
    seed.sql|functions.sql|users.sql|private_users.sql|contracts.sql|txns.sql|achievement_materialized_views.sql)
      continue ;;
  esac
  apply_sql "$f"
done

echo ""
echo "==> Phase 8: Materialized views"
echo "  achievement_materialized_views.sql"
apply_sql "$SCHEMA_DIR/achievement_materialized_views.sql"

echo ""
echo "==> Phase 9: Migrations"
for f in "$SCHEMA_DIR"/migrations/*.sql; do
  echo "  $(basename "$f")"
  apply_sql "$f"
done

echo ""
echo "==> Phase 10: Seed required data"
$PSQL -c "INSERT INTO system_trading_status (status, token) VALUES (true, 'MANA'), (true, 'CASH') ON CONFLICT (token) DO NOTHING;" 2>&1 | grep -iE "^(psql|ERROR)" || true

if [ -n "${ADMIN_API_KEY:-}" ]; then
  echo "  Seeding admin user..."
  $PSQL -c "
    INSERT INTO users (id, name, username, data) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'Admin',
      'Admin',
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000000',
        'shouldShowWelcome', false,
        'streakForgiveness', 0,
        'creatorTraders', jsonb_build_object('daily', 0, 'weekly', 0, 'monthly', 0, 'allTime', 0),
        'signupBonusPaid', 0
      )
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO private_users (id, data) VALUES (
      '00000000-0000-0000-0000-000000000000',
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000000',
        'email', 'admin@bot.internal',
        'apiKey', '$ADMIN_API_KEY',
        'notificationPreferences', '{}'::jsonb,
        'blockedUserIds', '[]'::jsonb,
        'blockedByUserIds', '[]'::jsonb,
        'blockedContractIds', '[]'::jsonb,
        'blockedGroupSlugs', '[]'::jsonb
      )
    ) ON CONFLICT (id) DO NOTHING;
  " 2>&1 | grep -iE "^(psql|ERROR)" || true
else
  echo "  ADMIN_API_KEY not set, skipping admin user seed."
fi

echo ""
echo "==> Phase 11: Create stub functions for optional extensions (pgvector)"
$PSQL -c "
CREATE OR REPLACE FUNCTION public.close_contract_embeddings(
  input_contract_id text,
  similarity_threshold double precision,
  match_count integer
) RETURNS TABLE (contract_id text, similarity double precision, data jsonb)
LANGUAGE sql AS \$\$
  SELECT NULL::text, NULL::double precision, NULL::jsonb WHERE false;
\$\$;
" 2>&1 | grep -iE "^(psql|ERROR)" || true

TABLE_COUNT=$($PSQL -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'" | tr -d ' ')
echo ""
echo "Database initialized. $TABLE_COUNT tables created."

# Verify critical tables exist
CRITICAL_TABLES="users private_users contracts txns user_notifications contract_boosts contract_movement_notifications contract_bets contract_comments group_contracts"
MISSING=""
for t in $CRITICAL_TABLES; do
  EXISTS=$($PSQL -t -c "SELECT to_regclass('public.$t')" | tr -d ' ')
  if [ "$EXISTS" = "" ]; then
    MISSING="$MISSING $t"
  fi
done
if [ -n "$MISSING" ]; then
  echo "WARNING: Missing critical tables:$MISSING"
  exit 1
fi

# Verify critical functions exist
CRITICAL_FUNCTIONS="firebase_uid is_valid_contract get_your_recent_contracts sample_resolved_bets close_contract_embeddings"
MISSING_FUNCS=""
for fn in $CRITICAL_FUNCTIONS; do
  EXISTS=$($PSQL -t -c "SELECT proname FROM pg_proc WHERE proname='$fn' LIMIT 1" | tr -d ' ')
  if [ -z "$EXISTS" ]; then
    MISSING_FUNCS="$MISSING_FUNCS $fn"
  fi
done
if [ -n "$MISSING_FUNCS" ]; then
  echo "WARNING: Missing critical functions:$MISSING_FUNCS"
  exit 1
fi
