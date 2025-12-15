#!/bin/bash
#
# Load Manifold schema into local Supabase
#
# This script loads all SQL schema files in the correct order to handle
# dependencies between tables, functions, triggers, and indexes.
#
# Prerequisites:
#   - Docker running with local Supabase started (npx supabase start)
#   - Run from the backend/supabase directory
#
# Usage:
#   ./load-local-schema.sh
#
# The script handles the dependency ordering automatically:
#   1. Extensions and text search configs (seed.sql)
#   2. Helper functions (functions.sql)
#   3. All table definitions
#   4. Re-run functions that depend on tables
#   5. Triggers, indexes, policies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Database connection
DB_CONTAINER="supabase_db_firestore-replica"
PSQL_CMD="docker exec -i $DB_CONTAINER psql -U postgres -d postgres"

run_sql() {
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - 2>&1
}

run_sql_file() {
    local file="$1"
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - < "$file" 2>&1
}

# Check Docker is available
if ! docker ps &>/dev/null; then
    log_error "Docker is not running or not accessible"
    log_info "Try: sudo systemctl start docker"
    log_info "Or use: sg docker -c '$0' if you just added yourself to the docker group"
    exit 1
fi

# Check Supabase container is running
if ! docker ps --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
    log_error "Supabase database container not running"
    log_info "Start it with: npx supabase start"
    exit 1
fi

log_info "Loading Manifold schema into local Supabase..."

# ==============================================================================
# Phase 1: Load seed.sql (extensions and text search configurations)
# ==============================================================================
log_info "Phase 1: Loading extensions and text search configs..."
run_sql_file seed.sql | grep -E "^(CREATE|ERROR)" || true

# ==============================================================================
# Phase 2: Load functions.sql (helper functions - some will fail, that's OK)
# ==============================================================================
log_info "Phase 2: Loading helper functions (first pass)..."

# First, load functions that others depend on (extract_text_from_rich_text_json
# must come before add_creator_name_to_description)
# This function is on lines 136-168 of functions.sql
sed -n '136,168p' functions.sql | \
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - > /dev/null 2>&1 || true

# Now load all functions (some may fail, that's OK - we'll retry after tables exist)
FUNC_RESULT=$(run_sql_file functions.sql 2>&1)
FUNC_CREATED=$(echo "$FUNC_RESULT" | grep -c "^CREATE FUNCTION" || true)
FUNC_ERRORS=$(echo "$FUNC_RESULT" | grep -c "^ERROR" || true)
log_info "  Created $FUNC_CREATED functions ($FUNC_ERRORS deferred - need tables first)"

# ==============================================================================
# Phase 3: Load all table definitions
# ==============================================================================
log_info "Phase 3: Loading table definitions..."

# Tables in dependency order (tables with no deps first, then those that reference them)
# This order was determined by analyzing foreign key relationships
TABLES=(
    # Core tables (no foreign keys to other app tables)
    users.sql
    private_users.sql
    groups.sql
    contracts.sql

    # Tables that reference core tables
    answers.sql
    contract_bets.sql
    contract_liquidity.sql
    txns.sql

    # User-related tables
    user_follows.sql
    user_reactions.sql
    user_events.sql
    user_notifications.sql
    user_contract_metrics.sql
    user_contract_views.sql
    user_portfolio_history.sql
    user_portfolio_history_latest.sql
    user_portfolio_history_archive.sql
    user_embeddings.sql
    user_disinterests.sql
    user_topic_interests.sql
    user_topics.sql
    user_quest_metrics.sql
    user_seen_chats.sql
    user_comment_view_events.sql
    user_view_events.sql
    user_contract_interactions.sql
    user_monitor_status.sql

    # Contract-related tables
    contract_comments.sql
    contract_comment_edits.sql
    contract_follows.sql
    contract_edits.sql
    contract_embeddings.sql
    contract_boosts.sql
    contract_movement_notifications.sql

    # Group-related tables
    group_contracts.sql
    group_members.sql
    group_invites.sql
    group_embeddings.sql
    group_groups.sql

    # Dashboard tables
    dashboards.sql
    dashboard_groups.sql
    dashboard_follows.sql

    # Messaging tables
    private_user_messages.sql
    private_user_message_channels.sql
    private_user_message_channel_members.sql
    private_user_seen_message_channels.sql
    private_user_phone_numbers.sql
    chat_messages.sql

    # Other tables
    manalinks.sql
    manalink_claims.sql
    leagues.sql
    league_chats.sql
    leagues_season_end_times.sql
    news.sql
    posts.sql
    post_follows.sql
    post_comment_edits.sql
    reviews.sql
    reports.sql
    mod_reports.sql
    chart_annotations.sql
    market_ads.sql
    market_drafts.sql
    sent_emails.sql
    push_notification_tickets.sql
    stats.sql
    daily_stats.sql
    mana_supply_stats.sql
    txn_summary_stats.sql
    scheduler_info.sql
    tasks.sql
    portfolios.sql
    portfolios_processed.sql
    platform_calibration.sql
    categories.sql
    topic_embeddings.sql
    stonk_images.sql
    system_trading_status.sql
    tv_schedule.sql
    audit_events.sql
    redemption_status.sql
    delete_after_reading.sql
    gidx_receipts.sql
    kyc_bonus_rewards.sql
    discord_users.sql
    discord_messages_markets.sql
    manachan_tweets.sql
    q_and_a.sql
    q_and_a_answers.sql
    creator_portfolio_history.sql

    # Love/dating tables (Manifold Love feature)
    lovers.sql
    love_questions.sql
    love_answers.sql
    love_compatibility_answers.sql
    love_likes.sql
    love_ships.sql
    love_stars.sql
    love_waitlist.sql
    lover_comments.sql

    # Old/legacy tables
    old_posts.sql
    old_post_comments.sql
)

# Extract and load just CREATE TABLE from each file
TABLES_CREATED=0
TABLES_FAILED=0
TABLES_SKIPPED=0
for sql_file in "${TABLES[@]}"; do
    if [[ ! -f "$sql_file" ]]; then
        ((TABLES_SKIPPED++)) || true
        continue
    fi

    # Extract CREATE TABLE statement (everything up to the closing ");")
    # The pattern handles indentation in the SQL files
    # Use temp file to avoid issues with special characters in SQL
    awk '/create table/,/^[[:space:]]*\);[[:space:]]*$/ { print }' "$sql_file" > /tmp/table_$$.sql

    if [[ -s /tmp/table_$$.sql ]]; then
        RESULT=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - < /tmp/table_$$.sql 2>&1)
        if echo "$RESULT" | grep -q "CREATE TABLE"; then
            ((TABLES_CREATED++)) || true
        elif echo "$RESULT" | grep -q "already exists"; then
            # Table already exists, that's fine
            ((TABLES_CREATED++)) || true
        else
            if echo "$RESULT" | grep -q "ERROR"; then
                log_warn "  Failed: $sql_file"
                echo "$RESULT" | grep "ERROR" | head -1
                ((TABLES_FAILED++)) || true
            fi
        fi
        rm -f /tmp/table_$$.sql
    else
        ((TABLES_SKIPPED++)) || true
    fi
done
log_info "  Created $TABLES_CREATED tables ($TABLES_FAILED failed)"

# ==============================================================================
# Phase 4: Re-run functions.sql (now that tables exist)
# ==============================================================================
log_info "Phase 4: Loading helper functions (second pass)..."
FUNC_RESULT=$(run_sql_file functions.sql 2>&1)
FUNC_CREATED=$(echo "$FUNC_RESULT" | grep -c "^CREATE FUNCTION" || true)
log_info "  Created/updated $FUNC_CREATED functions"

# ==============================================================================
# Phase 5: Load triggers, indexes, policies, and remaining DDL
# ==============================================================================
log_info "Phase 5: Loading triggers, indexes, and policies..."

# For each table file, load everything after the CREATE TABLE statement
EXTRA_LOADED=0
for sql_file in "${TABLES[@]}"; do
    if [[ ! -f "$sql_file" ]]; then
        continue
    fi

    # Extract everything after the CREATE TABLE (triggers, indexes, policies)
    # Use temp file to avoid issues with special characters in SQL
    awk '
        BEGIN { in_table = 0; after_table = 0 }
        /create table/ { in_table = 1 }
        /^[[:space:]]*\);[[:space:]]*$/ { if (in_table) { in_table = 0; after_table = 1; next } }
        after_table { print }
    ' "$sql_file" > /tmp/extra_$$.sql

    if [[ -s /tmp/extra_$$.sql ]]; then
        RESULT=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - < /tmp/extra_$$.sql 2>&1)
        ((EXTRA_LOADED++)) || true
        rm -f /tmp/extra_$$.sql
    fi
done
log_info "  Processed $EXTRA_LOADED files"

# ==============================================================================
# Phase 6: Load views and materialized views
# ==============================================================================
log_info "Phase 6: Loading views..."
if [[ -f views.sql ]]; then
    run_sql_file views.sql | grep -E "^(CREATE|ERROR)" | head -10 || true
fi

if [[ -f achievement_materialized_views.sql ]]; then
    run_sql_file achievement_materialized_views.sql 2>&1 | grep -E "^(CREATE|ERROR)" | head -5 || true
fi

# ==============================================================================
# Summary
# ==============================================================================
log_info "Schema loading complete!"
echo ""

# Show what we have
TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | tr -d ' ')
FUNC_COUNT=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace" | tr -d ' ')

log_info "Database summary:"
echo "  Tables: $TABLE_COUNT"
echo "  Functions: $FUNC_COUNT"
echo ""
log_info "You can explore the schema at: http://127.0.0.1:54323"
