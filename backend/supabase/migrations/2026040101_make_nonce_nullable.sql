-- Make nonce nullable for Bitcoin block hash provably fair scheme.
-- Nonce is now set at winner selection time (stores the Bitcoin block hash),
-- rather than being pre-generated at creation time.

begin;

alter table public.sweepstakes
  alter column nonce drop not null,
  alter column nonce drop default;

alter table public.charity_giveaways
  alter column nonce drop not null,
  alter column nonce drop default;

commit;
