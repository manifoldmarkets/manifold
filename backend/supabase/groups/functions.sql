create
or replace function is_group_admin (this_group_id text, this_user_id text) returns boolean immutable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM group_role
        WHERE (
                group_id = this_group_id
                and member_id = this_user_id
                and role='admin'
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
