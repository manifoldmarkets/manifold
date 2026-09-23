-- cpmm-multi-2: add per-answer CPMM parameter `p` to answers.
--
-- Binary cpmm-1 markets carry a `p` on the contract (CPMM.p) so a non-50% market can be
-- represented by a balanced, deep pool. Multi-choice answers have no such field, pinning
-- every answer to p = 0.5 (uniform 1/n init, lossy liquidity adds). cpmm-multi-2 gives each
-- answer its own `p`.
--
-- Additive and backwards-compatible: `not null default 0.5` means every existing row reads
-- p = 0.5 with no backfill, and a cpmm-multi-1 answer is exactly a cpmm-multi-2 answer with
-- p = 0.5. Probability reads stay byte-identical (getCpmmProbability(pool, 0.5) == N/(Y+N)).
alter table answers
  add column if not exists p numeric not null default 0.5;
