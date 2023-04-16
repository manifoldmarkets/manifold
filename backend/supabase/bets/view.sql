create view public.contract_bets_rbac as
select *
from contract_bets
where NOT data @> '{"visibility": "private"}'
    OR (
        can_access_private_contract(contract_id, firebase_uid())
    )