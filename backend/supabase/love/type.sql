create type love_question_with_count_type as (
  id bigint,
  creator_id text,
  created_time timestamptz,
  question text,
  importance_score numeric,
  answer_type text, -- free_response, multiple_choice, integer
  multiple_choice_options jsonb, -- {0: "strongly disagree", 1: "disagree"}
  answer_count bigint
);
