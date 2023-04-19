CREATE OR REPLACE FUNCTION can_access_private_contract(this_contract_id TEXT, this_member_id TEXT)
RETURNS BOOLEAN
IMMUTABLE
PARALLEL SAFE
LANGUAGE SQL
AS $$
SELECT EXISTS (
    SELECT 1
    FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = this_contract_id
      AND group_members.member_id = this_member_id
) $$;
