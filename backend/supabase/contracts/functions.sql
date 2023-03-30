create or replace function can_access_contract(contract_id text, member_id text) returns boolean stable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM (
                group_members
                JOIN group_contracts ON (
                    (
                        group_members.group_id = group_contracts.group_id
                    )
                )
            )
        WHERE (
                (group_contracts.contract_id = contract_id)
                AND (group_members.member_id = member_id)
            )
    ) $$;