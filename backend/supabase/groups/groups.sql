create
    or replace function get_contracts_in_group_slugs_1 (contract_ids text[], p_group_slugs text[], ignore_slugs text[]) returns
    table( data JSON, importance_score numeric) stable parallel safe language sql as $$
select data, importance_score
from public_contracts
where id = any(contract_ids)
  and (public_contracts.group_slugs && p_group_slugs)
  and not (public_contracts.group_slugs && ignore_slugs)
$$;

create
    or replace function get_recently_active_contracts_in_group_slugs_1 ( p_group_slugs text[], ignore_slugs text[], max int) returns
    table( data JSON, importance_score numeric) stable parallel safe language sql as $$
select data, importance_score
from public_contracts
where (public_contracts.group_slugs && p_group_slugs)
  and not (public_contracts.group_slugs && ignore_slugs)
order by last_updated_time desc
limit max
$$;

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
    max_count int,
    name_similarity_threshold float
) returns table (name text, group_id text, similarity float) language sql as $$
with groups_similar_to_news as (
    select name,
           group_id,
           1 - (group_embeddings.embedding <=> query_embedding) as similarity,
           row_number() over (order by (group_embeddings.embedding <=> query_embedding)) as row_num
    from group_embeddings
             left join groups on groups.id = group_embeddings.group_id
    where 1 - (
            group_embeddings.embedding <=> query_embedding
        ) > similarity_threshold
    order by group_embeddings.embedding <=> query_embedding
    limit max_count+10 -- add some to account for duplicates
),
     filtered_groups as (
         select
             g1.*
         from
             groups_similar_to_news as g1
         where not exists (
             select 1
             from groups_similar_to_news as g2
             where g1.row_num > g2.row_num
               and similarity(g1.name, g2.name) > name_similarity_threshold
         )
     )
select name, group_id, similarity from filtered_groups
order by similarity desc
limit max_count;
$$;


create index if not exists group_slug on public.groups (slug);
create index if not exists group_name on public.groups (name);
create index if not exists group_creator_id on public.groups (creator_id);
create index if not exists total_members on public.groups (total_members desc);
create index if not exists privacy_status_idx on public.groups using btree (privacy_status);


drop policy if exists "Enable read access for admin" on public.groups;

create policy "Enable read access for admin" on public.groups for
    select
    to service_role using (true);

drop policy if exists "Enable read access for all if group is public/curated" on public.groups;

create policy "Enable read access for all if group is public/curated" on public.groups for
    select
    using ((privacy_status <> 'private'));


create
    or replace function group_populate_cols () returns trigger language plpgsql as $$ begin
    if new.data is not null then
        new.privacy_status := (new.data)->>'privacyStatus';
        new.slug := (new.data)->>'slug';
        new.name := (new.data)->>'name';
        new.creator_id := (new.data)->>'creatorId';
    end if;
    return new;
end $$;

create trigger group_populate before insert
    or
    update on groups for each row
execute function group_populate_cols ();
