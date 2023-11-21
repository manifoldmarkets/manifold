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
