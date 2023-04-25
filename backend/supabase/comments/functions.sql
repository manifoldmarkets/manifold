create
or replace function get_reply_chain_comments_matching_contracts (contract_ids text[], past_time_ms bigint) returns table (id text, contract_id text, data JSONB) as $$
BEGIN
    RETURN QUERY
        WITH matching_comments AS (
            SELECT
                c1.comment_id AS id,
                c1.contract_id,
                c1.data
            FROM
                contract_comments c1
            WHERE
                    c1.contract_id = ANY(contract_ids)
              AND created_time >= millis_to_ts(past_time_ms)
        ),
             reply_chain_comments AS (
                 SELECT
                     c2.comment_id AS id,
                     c2.contract_id,
                     c2.data
                 FROM
                     contract_comments c2
                         JOIN matching_comments mc
                              ON c2.contract_id = mc.contract_id
                                  AND c2.data ->> 'replyToCommentId' = mc.data ->> 'replyToCommentId'
                                  AND c2.comment_id != mc.id
             ),
             parent_comments AS (
                 SELECT
                     c3.comment_id AS id,
                     c3.contract_id,
                     c3.data
                 FROM
                     contract_comments c3
                         JOIN matching_comments mc
                              ON c3.contract_id = mc.contract_id
                                  AND c3.comment_id = mc.data ->> 'replyToCommentId'
             )
        SELECT * FROM matching_comments
        UNION ALL
        SELECT * FROM parent_comments
        UNION ALL
        SELECT * FROM reply_chain_comments;
END;
$$ language plpgsql;
