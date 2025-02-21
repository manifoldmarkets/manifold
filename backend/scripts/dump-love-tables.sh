#!/bin/bash

pg_dump -U postgres -d manifold \
  -t lovers \
  -t love_answers \
  -t love_compatability_answers \
  -t love_likes \
  -t love_questions \
  -t love_ships \
  -t love_waitlist \
  -t private_user_channels \
  -t private_user_seen_message_channels \
  --function firebase_uid \
  --function get_average_rating \
  --function get_compatibility_questions_with_answer_count \
  --function get_love_question_answers_and_lovers \
  --function millis_interval \
  --function millis_to_ts \
  --function random_alphanumeric \
  --function to_jsonb \
  --function ts_to_millis \