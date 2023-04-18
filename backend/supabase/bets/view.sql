create or replace view
  public.contract_bets_rbac as
select
  *
from
  contract_bets
where
  (visibility <> 'private')
  or (
    can_access_private_contract (contract_id, firebase_uid ())
  )
