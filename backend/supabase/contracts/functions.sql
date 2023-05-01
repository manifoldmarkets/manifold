create
or replace function can_access_private_contract (this_contract_id text, this_member_id text) returns boolean immutable parallel SAFE language sql as $$
SELECT EXISTS (
    SELECT 1
    FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = this_contract_id
      AND group_members.member_id = this_member_id
) $$;
