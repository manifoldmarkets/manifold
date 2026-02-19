#!/usr/bin/env bash
# Load all Supabase schema files into local Supabase instance.
# Run after `npx supabase start`.
#
# Usage: ./load-local-schema.sh
#
# Handles two circular dependencies:
# 1. Within functions.sql: add_creator_name_to_description (line 3) depends
#    on extract_text_from_rich_text_json (line 137) — function ordering.
# 2. Between functions.sql and tables: contracts.sql needs
#    add_creator_name_to_description, but some functions need contracts table.
#
# Solution: THREE passes of functions.sql:
#   Pass 1: Creates base functions (extract_text_from_rich_text_json, etc.)
#   Pass 2: Creates functions depending on pass-1 functions
#            (add_creator_name_to_description) — needed before tables
#   [Tables loaded here]
#   Pass 3: Creates table-dependent functions
#
# Also strips `leakproof` from function definitions since the local
# Supabase postgres user is not a superuser.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

run_sql_file() {
  local file="$1"
  local name
  name="$(basename "$file")"
  echo -n "  Loading $name... "
  if psql "$DB_URL" -f "$file" > /dev/null 2>&1; then
    echo "OK"
  else
    echo "WARN (some errors, may be expected)"
    psql "$DB_URL" -f "$file" 2>&1 | grep -i "error" | head -5 || true
  fi
}

# Load functions.sql with leakproof stripped (local postgres isn't superuser).
# Errors are expected — table-dependent functions will fail on first pass.
run_functions() {
  local label="$1"
  echo -n "  functions.sql ($label)... "
  local err_count
  err_count=$(sed 's/ leakproof / /gi' "$SCRIPT_DIR/functions.sql" \
    | psql "$DB_URL" -f - 2>&1 \
    | grep -ci "error" || true)
  err_count="${err_count:-0}"
  if [ "$err_count" -eq 0 ]; then
    echo "OK (all succeeded)"
  else
    echo "OK ($err_count skipped)"
  fi
}

echo "=== Loading Supabase schema into local database ==="
echo ""

# Phase 1: Extensions and text search configuration
echo "Phase 1: Extensions and base configuration"
run_sql_file "$SCRIPT_DIR/seed.sql"

# Phase 2: Functions — two pre-table passes
# Pass 1: Creates base functions (extract_text_from_rich_text_json, etc.)
# Pass 2: Creates functions that depend on pass-1 functions
#          (add_creator_name_to_description → extract_text_from_rich_text_json)
echo ""
echo "Phase 2: Functions (pre-table passes)"
run_functions "pass 1 — base functions"
run_functions "pass 2 — derived functions"

# Phase 2b: Create missing custom types referenced by table definitions
# These types are not defined in any schema file but are used by tables.
echo ""
echo "Phase 2b: Missing custom types"
echo -n "  Creating types... "
psql "$DB_URL" -c "
  DO \$\$ BEGIN
    CREATE TYPE status_type AS ENUM ('new', 'under review', 'resolved', 'needs admin');
  EXCEPTION WHEN duplicate_object THEN null;
  END \$\$;
" > /dev/null 2>&1
echo "OK"

# Phase 3: Core tables (referenced by foreign keys in other tables)
echo ""
echo "Phase 3: Core tables"
for f in \
  users.sql \
  private_users.sql \
  contracts.sql \
  groups.sql \
  dashboards.sql \
  old_posts.sql \
  charity_giveaways.sql \
  ; do
  run_sql_file "$SCRIPT_DIR/$f"
done

# Phase 4: All remaining table files (alphabetical)
echo ""
echo "Phase 4: Remaining tables"

declare -A loaded=(
  [seed.sql]=1
  [functions.sql]=1
  [users.sql]=1
  [private_users.sql]=1
  [contracts.sql]=1
  [groups.sql]=1
  [dashboards.sql]=1
  [old_posts.sql]=1
  [charity_giveaways.sql]=1
  [views.sql]=1
  [achievement_materialized_views.sql]=1
)

for f in "$SCRIPT_DIR"/*.sql; do
  name="$(basename "$f")"
  if [[ -z "${loaded[$name]:-}" ]]; then
    run_sql_file "$f"
  fi
done

# Phase 5: Functions — final pass (now tables exist, table-dependent functions succeed)
echo ""
echo "Phase 5: Functions (pass 3 — table-dependent)"
run_functions "pass 3 — table-dependent"

# Phase 6: Views and materialized views (depend on tables + functions)
echo ""
echo "Phase 6: Views and materialized views"
run_sql_file "$SCRIPT_DIR/views.sql"
run_sql_file "$SCRIPT_DIR/achievement_materialized_views.sql"

echo ""
echo "=== Schema loading complete ==="
