alter table contract_bets
add column token default 'MANA';

alter table contract_liquidity
add column token default 'MANA';

alter table answers
add column token default 'MANA';

alter table user_portfolio_history
add column cash_balance numeric default 0 not null;
