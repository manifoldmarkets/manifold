#!/bin/bash

local PGPASSWORD=$SUPABASE_PASSWORD
local DB_NAME = "db.$SUPABASE_INSTANCE_ID.supabase.co"

# Connect to the database and initialize tables
psql -U postgres -d $DB_NAME -p 5432 -w -f ./dump-lovers-temp.sql

pg_dump -U postgres -d $DB_NAME -p 5432 -w -f ./gen-love-dump.sql \
  -t lovers \
  -t love_answers \
  -t love_compatability_answers \
  -t love_likes \
  -t love_questions \
  -t love_ships \
  -t love_waitlist \
  -t private_user_channels \
  -t private_user_seen_message_channels \
  -t temp_users \
  -t temp_love_messages \
  --function firebase_uid \
  --function get_average_rating \
  --function get_compatibility_questions_with_answer_count \
  --function get_love_question_answers_and_lovers \
  --function millis_interval \
  --function millis_to_ts \
  --function random_alphanumeric \
  --function to_jsonb \
  --function ts_to_millis \