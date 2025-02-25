#!/bin/bash

export PGPASSWORD=$SUPABASE_PASSWORD

DB_NAME="db.mfodonznyfxllcezufgr.supabase.co" # dev
# DB_NAME="db.pxidrgkatumlvfqaxcll.supabase.co" # prod

# Connect to the database and initialize tables
psql -U postgres -d postgres -h $DB_NAME -p 5432 -w -f ./dump-lovers-temp.sql

pg_dump -U postgres -d postgres -h $DB_NAME -n public -w \
  -t lovers \
  -t love_answers \
  -t love_compatibility_answers \
  -t love_likes \
  -t love_questions \
  -t love_ships \
  -t love_waitlist \
  -t private_user_message_channels \
  -t private_user_seen_message_channels \
  -t temp_users \
  -t temp_love_messages \
  > gen-love-dump.sql

  #  TODO: just copy pasta these functions from functions.sql
  # --function firebase_uid \
  # --function get_average_rating \
  # --function get_compatibility_questions_with_answer_count \
  # --function get_love_question_answers_and_lovers \
  # --function millis_interval \
  # --function millis_to_ts \
  # --function random_alphanumeric \
  # --function to_jsonb \
  # --function ts_to_millis \

# psql -U postgres -d postgres -h $DB_NAME -p 5432 -w -f ./dump-lovers-cleanup.sql