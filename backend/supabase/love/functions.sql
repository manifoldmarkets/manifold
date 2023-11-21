create
or replace function get_free_response_questions_with_answer_count () returns setof love_question_with_count_type as $$
BEGIN
    RETURN QUERY 
    SELECT 
        love_questions.*,
        COUNT(love_answers.question_id) as answer_count
    FROM 
        love_questions
    LEFT JOIN 
        love_answers ON love_questions.id = love_answers.question_id
    GROUP BY 
        love_questions.id
    ORDER BY 
        answer_count DESC;
END;
$$ language plpgsql;

drop function get_love_question_answers_and_lovers (question_id bigint);


drop function get_love_question_answers_and_lovers (p_question_id bigint);
create
or replace function get_love_question_answers_and_lovers (p_question_id bigint) returns setof other_lover_answers_type as $$
BEGIN
    RETURN QUERY
    SELECT 
        love_answers.question_id,
        love_answers.created_time,
        love_answers.free_response,
        love_answers.multiple_choice,
        love_answers.integer,
        lovers.age,
        lovers.gender,
        lovers.city,
        users.data
    FROM
        lovers
    JOIN
        love_answers ON lovers.user_id = love_answers.creator_id
    join 
        users on lovers.user_id = users.id 
    WHERE
        love_answers.question_id = p_question_id
    order by love_answers.created_time desc;
END;
$$ language plpgsql;
