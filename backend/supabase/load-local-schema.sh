#!/usr/bin/env bash
# Load all Supabase schema files into local Supabase instance.
# Run after `npx supabase start`.
#
# Usage: ./load-local-schema.sh

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
    echo "WARN (errors, may be OK if constraints already exist)"
    # Re-run showing errors for debugging
    psql "$DB_URL" -f "$file" 2>&1 | grep -i "error" | head -5 || true
  fi
}

echo "=== Loading Supabase schema into local database ==="
echo ""

# Phase 1: Extensions and text search configuration
echo "Phase 1: Extensions and base configuration"
run_sql_file "$SCRIPT_DIR/seed.sql"

# Phase 2: Functions (must come before tables that use them in triggers/generated columns)
echo ""
echo "Phase 2: Functions"
run_sql_file "$SCRIPT_DIR/functions.sql"

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

# Collect files we've already loaded or want to skip
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

# Phase 5: Views and materialized views (depend on tables)
echo ""
echo "Phase 5: Views and materialized views"
run_sql_file "$SCRIPT_DIR/views.sql"
run_sql_file "$SCRIPT_DIR/achievement_materialized_views.sql"

echo ""
echo "=== Schema loading complete ==="
