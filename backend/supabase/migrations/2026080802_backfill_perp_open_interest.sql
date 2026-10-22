-- Funding now derives its rate from each side's open interest instead of the
-- backing pools (common/perps/amm.ts). The pools hold MARGIN, so their ratio
-- only tracks exposure when both sides run comparable leverage; where they
-- don't, the sign inverts and funding pays the crowded side. On 2026-08-08
-- two of the four live markets were doing exactly that:
--
--   bitcoin-price-usd    OI 453,771 L / 348,184 S (1.30 long-heavy)
--                        pools 59,555 L / 82,975 S (0.72 — reads short-heavy)
--   openweight-ai        OI  99,722 L /  50,954 S (1.96 long-heavy)
--                        pools 12,553 L / 15,261 S (0.82 — reads short-heavy)
--
-- Read paths (market page, chart, bet panel, embed) show the live rate and
-- cannot load positions, so the engine denormalizes open interest onto the
-- contract. Backfill it here rather than waiting for each market's next
-- engine transition, which would leave the UI showing a rate of zero (the
-- fail-closed default for an absent field) until then — up to a full day on
-- the daily-funding markets.
--
-- Derived, not incremental: the engine recomputes both values from the
-- positions it holds under the contract advisory lock on every transition
-- that can change a position size, so this cannot drift afterwards.
update contracts c
set data = c.data || jsonb_build_object(
  'openInterestLong', coalesce(oi.long_oi, 0),
  'openInterestShort', coalesce(oi.short_oi, 0)
)
from (
  select
    c2.id,
    sum(p.size) filter (where p.direction = 'long') as long_oi,
    sum(p.size) filter (where p.direction = 'short') as short_oi
  from contracts c2
  left join contract_perp_positions p
    on p.contract_id = c2.id and p.size > 0
  where c2.data ->> 'outcomeType' = 'PERP'
  group by c2.id
) oi
where c.id = oi.id;
