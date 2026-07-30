// ---------------------------------------------------------------------------
// reconstruct.ts — probability-path reconstruction spot check.
//
// For the busiest resolved binary (cpmm-1) markets in scope, walk the delivered
// bets ordered by time and confirm the probability series is faithful. The
// per-market signal is CONTINUITY: each bet's probBefore equals the previous
// bet's probAfter (the market price is continuous; redemptions don't move it) —
// a corrupt or mis-serialized series would break this.
//
// SEVERAL markets are probed, and the gate is that MOST of them reconstruct.
// One market is not a safe gate: prod contains markets whose bet series has
// genuine holes in the SOURCE data — e.g. 0IUCA5s8EN, where ~50% of bets
// between 2026-01-30 and 2026-02-24 start at a price no other bet ended at
// (reproduced straight from the DB in SQL, with no export involved; bets
// removed by moderation leave exactly this shape). An export defect corrupts
// EVERY series, so "most markets reconstruct" catches it, while a single
// anomalous source market can't abort a four-hour delivery.
//
// `finalProbOnResolutionSide` is reported but is NOT a gate: a Manifold market's
// resolution is a creator decision, not its last trade price, so a market can
// trade at 56% and resolve NO. (An earlier version wrongly failed on this.)
//
// Points are captured from the SAME redacted rows that get written to Parquet,
// so this validates the delivered series, not just the DB. probBefore/probAfter
// are untouched by pseudonymization. Fields: common/src/bet.ts:35-42.
// ---------------------------------------------------------------------------

export interface ProbePoint {
  createdTime: number
  probBefore: number
  probAfter: number
  isRedemption?: boolean
}

export interface MarketRecon {
  contractId: string
  resolution: string
  ran: boolean
  betCount?: number
  continuityViolations?: number
  maxDiscontinuity?: number
  finalProbAfter?: number | null
  finalProbOnResolutionSide?: boolean // informational only, not a gate
  ok?: boolean
  note?: string
}

export interface ReconResult {
  ran: boolean
  ok?: boolean
  marketsProbed?: number
  marketsReconstructed?: number
  markets?: MarketRecon[]
  note?: string
}

// Continuity tolerance: probBefore/probAfter are engine-written doubles that
// round-trip through JSON+Parquet, so they should match near-exactly; the slack
// absorbs the occasional same-millisecond ordering ambiguity.
const CONTINUITY_EPS = 1e-4

function reconstructOne(
  contractId: string,
  resolution: string,
  rawPoints: ProbePoint[]
): MarketRecon {
  // Redemption rows carry a STALE probBefore/probAfter (the price when the
  // redeemed position was entered, not the current price) — they're excluded
  // from the chain, exactly because they don't move the market. Taker bets and
  // maker limit rows both slot into a continuous price chain.
  const pts = rawPoints
    .filter((p) => !p.isRedemption)
    .filter((p) => Number.isFinite(p.probBefore) && Number.isFinite(p.probAfter))
    .sort((a, b) => a.createdTime - b.createdTime)

  if (pts.length < 2) {
    return { contractId, resolution, ran: false, note: 'not enough bets to reconstruct' }
  }

  let continuityViolations = 0
  let maxDiscontinuity = 0
  for (let i = 1; i < pts.length; i++) {
    const disc = Math.abs(pts[i].probBefore - pts[i - 1].probAfter)
    if (disc > maxDiscontinuity) maxDiscontinuity = disc
    if (disc > CONTINUITY_EPS) continuityViolations++
  }

  const finalProbAfter = pts[pts.length - 1].probAfter
  const finalProbOnResolutionSide =
    resolution === 'YES' ? finalProbAfter > 0.5 : finalProbAfter < 0.5

  // Per-market pass: no single large jump, AND small (eps-level) discontinuities
  // must be rare — same-millisecond ordering ambiguity explains an occasional
  // one, but a corrupt series shows many. (Without the rate check, hundreds of
  // just-under-threshold jumps would pass.) Prod's busiest markets sit at
  // 0-3 violations in 10k-58k bets, so 1% is generous.
  const ok =
    maxDiscontinuity < 0.02 &&
    continuityViolations <= Math.max(2, Math.ceil(pts.length * 0.01))
  return {
    contractId,
    resolution,
    ran: true,
    betCount: pts.length,
    continuityViolations,
    maxDiscontinuity,
    finalProbAfter,
    finalProbOnResolutionSide,
    ok,
  }
}

export function reconstructPaths(
  probes: { id: string; resolution: string }[],
  pointsByContract: Map<string, ProbePoint[]>
): ReconResult {
  const markets = probes.map((p) =>
    reconstructOne(p.id, p.resolution, pointsByContract.get(p.id) ?? [])
  )
  const ran = markets.filter((m) => m.ran)
  if (ran.length === 0) {
    return {
      ran: false,
      markets,
      note: 'no probed market had enough bets to reconstruct',
    }
  }
  const passed = ran.filter((m) => m.ok).length
  return {
    ran: true,
    // Strict majority of the markets that could be reconstructed. A single
    // source-data anomaly is tolerated; systematic corruption is not.
    ok: passed * 2 > ran.length,
    marketsProbed: ran.length,
    marketsReconstructed: passed,
    markets,
  }
}
