create
or replace function is_group_admin (this_group_id text, this_user_id text) returns boolean immutable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM group_members
        WHERE (
                group_id = this_group_id
                and member_id = this_user_id
                and role='admin'
            )
    ) $$;

create
or replace function has_moderator_or_above_role (this_group_id text, this_user_id text) returns boolean immutable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM group_members
        WHERE (
                group_id = this_group_id
                and member_id = this_user_id
                and (role='admin' or role='moderator')
            )
    ) $$;

create
or replace function is_group_member (this_group_id text, this_user_id text) returns boolean immutable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM group_members
        WHERE (
                group_id = this_group_id
                and member_id = this_user_id
            )
    ) $$;

create
or replace function check_group_accessibility (this_group_id text, this_user_id text) returns boolean as $$
declare
    is_accessible boolean;
begin
    select
        case
            when g.privacy_status in ('public', 'curated') then true
            when g.privacy_status = 'private' then is_group_member(this_group_id, this_user_id)
            else false
        end
    into is_accessible
    from groups g
    where g.id = this_group_id;

    return is_accessible;
end;
$$ language plpgsql immutable parallel safe;

create
or replace function get_group_contracts (this_group_id text) returns table (data JSON) immutable parallel safe language sql as $$
select contracts.data from 
    contracts join group_contracts on group_contracts.contract_id = contracts.id
    where group_contracts.group_id = this_group_id 
    $$;

create
    or replace function search_group_embeddings (
    query_embedding vector (1536),
    similarity_threshold float,
    match_count int,
    name_similarity_threshold float
) returns table (group_id text, similarity float) language sql as $$
    with groups_similar_to_news as (
        select group_id,
           1 - (group_embeddings.embedding <=> query_embedding) as similarity,
           row_number() over (order by (group_embeddings.embedding <=> query_embedding)) as row_num
    from group_embeddings
    where 1 - (
            group_embeddings.embedding <=> query_embedding
        ) > similarity_threshold
    order by group_embeddings.embedding <=> query_embedding
    limit match_count
    ),
    filtered_groups as (
         select
             a.*
         from
             groups_similar_to_news as a
         where not exists (
             select 1
             from groups_similar_to_news as b
             where a.row_num > b.row_num
               and similarity(a.name, b.name) > name_similarity_threshold
         )
     )
    select * from filtered_groups
    order by similarity desc
    limit 15;
$$;