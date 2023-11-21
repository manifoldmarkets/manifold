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

drop type other_lover_answers_type;

create type other_lover_answers_type as (
  question_id bigint,
  created_time timestamptz,
  free_response text,
  multiple_choice int,
  integer int,
  age int,
  gender text,
  city text,
  data jsonb
);
