// The 2028 electoral college, simulated from Manifold's state markets.
//
// Each unit (50 states, DC, and the Maine and Nebraska congressional
// districts) has a market chance p that the Democrat carries it. States don't
// move independently — a good night for one party is good almost everywhere —
// so each simulated election draws one national swing shared by every unit
// plus a smaller local one:
//
//   X_i = sqrt(rho) * N + sqrt(1 - rho) * e_i,   N, e_i ~ Normal(0, 1)
//
// and the Democrat carries unit i when X_i < z_i = Phi^-1(p_i). Each X_i is
// standard normal, so every unit keeps exactly its market chance; rho only
// sets how strongly they move together. The tipping point is the unit that
// takes the winner to 270 when units are ordered from the winner's strongest
// to weakest.

export type ElectoralUnit = {
  key: string // 'PA', 'ME-2', 'NE-2', 'DC'
  name: string
  ev: number
  // The state a district belongs to, for the map.
  state: string
}

// Electoral votes from the 2020 census apportionment (2024 and 2028).
const STATES: [string, string, number][] = [
  ['AL', 'Alabama', 9],
  ['AK', 'Alaska', 3],
  ['AZ', 'Arizona', 11],
  ['AR', 'Arkansas', 6],
  ['CA', 'California', 54],
  ['CO', 'Colorado', 10],
  ['CT', 'Connecticut', 7],
  ['DE', 'Delaware', 3],
  ['DC', 'District of Columbia', 3],
  ['FL', 'Florida', 30],
  ['GA', 'Georgia', 16],
  ['HI', 'Hawaii', 4],
  ['ID', 'Idaho', 4],
  ['IL', 'Illinois', 19],
  ['IN', 'Indiana', 11],
  ['IA', 'Iowa', 6],
  ['KS', 'Kansas', 6],
  ['KY', 'Kentucky', 8],
  ['LA', 'Louisiana', 8],
  ['ME', 'Maine', 2],
  ['MD', 'Maryland', 10],
  ['MA', 'Massachusetts', 11],
  ['MI', 'Michigan', 15],
  ['MN', 'Minnesota', 10],
  ['MS', 'Mississippi', 6],
  ['MO', 'Missouri', 10],
  ['MT', 'Montana', 4],
  ['NE', 'Nebraska', 2],
  ['NV', 'Nevada', 6],
  ['NH', 'New Hampshire', 4],
  ['NJ', 'New Jersey', 14],
  ['NM', 'New Mexico', 5],
  ['NY', 'New York', 28],
  ['NC', 'North Carolina', 16],
  ['ND', 'North Dakota', 3],
  ['OH', 'Ohio', 17],
  ['OK', 'Oklahoma', 7],
  ['OR', 'Oregon', 8],
  ['PA', 'Pennsylvania', 19],
  ['RI', 'Rhode Island', 4],
  ['SC', 'South Carolina', 9],
  ['SD', 'South Dakota', 3],
  ['TN', 'Tennessee', 11],
  ['TX', 'Texas', 40],
  ['UT', 'Utah', 6],
  ['VT', 'Vermont', 3],
  ['VA', 'Virginia', 13],
  ['WA', 'Washington', 12],
  ['WV', 'West Virginia', 4],
  ['WI', 'Wisconsin', 10],
  ['WY', 'Wyoming', 3],
]

// Maine and Nebraska give two electoral votes to the statewide winner (the
// state rows above carry those two) and one to each congressional district.
const DISTRICTS: ElectoralUnit[] = [
  { key: 'ME-1', name: "Maine's 1st District", ev: 1, state: 'ME' },
  { key: 'ME-2', name: "Maine's 2nd District", ev: 1, state: 'ME' },
  { key: 'NE-1', name: "Nebraska's 1st District", ev: 1, state: 'NE' },
  { key: 'NE-2', name: "Nebraska's 2nd District", ev: 1, state: 'NE' },
  { key: 'NE-3', name: "Nebraska's 3rd District", ev: 1, state: 'NE' },
]

export const ELECTORAL_UNITS: ElectoralUnit[] = [
  ...STATES.map(([key, name, ev]) => ({ key, name, ev, state: key })),
  ...DISTRICTS,
]

export const TOTAL_EV = 538
export const EV_TO_WIN = 270

// Mulberry32: a small seeded PRNG, so the server render is reproducible.
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal draws (Box–Muller), from a uniform source.
export function makeNormal(rng: () => number) {
  let spare: number | undefined
  return () => {
    if (spare !== undefined) {
      const s = spare
      spare = undefined
      return s
    }
    let u = 0
    while (u <= Number.EPSILON) u = rng()
    const v = rng()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
}

// Inverse standard normal CDF (Acklam's rational approximation, relative
// error < 1.2e-9). p is clamped away from 0 and 1.
export function inverseNormalCdf(p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p))
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ]
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ]
  const low = 0.02425
  if (q < low) {
    const r = Math.sqrt(-2 * Math.log(q))
    return (
      (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1)
    )
  }
  if (q > 1 - low) {
    const r = Math.sqrt(-2 * Math.log(1 - q))
    return -(
      (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1)
    )
  }
  const r = (q - 0.5) * (q - 0.5)
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      (q - 0.5)) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

export type EcModelOptions = {
  sims?: number
  rho?: number
  seed?: number
}

export type EcModelResult = {
  sims: number
  rho: number
  // Chance the Democrat reaches 270, the Republican does, or it's 269-269.
  pDem: number
  pRep: number
  pTie: number
  meanDemEv: number
  // P(Democrat wins exactly k electoral votes), k = 0..538.
  distribution: number[]
  // How often each unit was the tipping point, most often first.
  tippingPoints: { key: string; p: number }[]
  // The probabilities the model ran on, by unit (after clamping).
  unitProbs: Record<string, number>
}

const PROB_FLOOR = 0.005

// probs: P(Democrat carries the unit), by unit key. Every unit in `units` must
// have one; callers fill gaps with a prior before calling.
export function simulateElectoralCollege(
  probs: Record<string, number>,
  options: EcModelOptions = {},
  units: ElectoralUnit[] = ELECTORAL_UNITS
): EcModelResult {
  const sims = Math.max(1, Math.floor(options.sims ?? 20000))
  const rho = Math.min(0.999, Math.max(0, options.rho ?? 0.75))
  const rng = makeRng(options.seed ?? 2028)
  const normal = makeNormal(rng)
  const total = units.reduce((s, u) => s + u.ev, 0)
  const needed = Math.floor(total / 2) + 1

  const unitProbs: Record<string, number> = {}
  const thresholds = units.map((u) => {
    const raw = probs[u.key]
    if (!Number.isFinite(raw))
      throw new Error(`No probability for electoral unit ${u.key}`)
    const p = Math.min(1 - PROB_FLOOR, Math.max(PROB_FLOOR, raw))
    unitProbs[u.key] = p
    return inverseNormalCdf(p)
  })
  const a = Math.sqrt(rho)
  const b = Math.sqrt(1 - rho)

  const counts = new Array<number>(total + 1).fill(0)
  const tipping = new Array<number>(units.length).fill(0)
  let dem = 0
  let rep = 0
  let tie = 0
  let evSum = 0
  // margin > 0: the Democrat carries the unit, by that much.
  const margins = new Float64Array(units.length)
  const order = units.map((_, i) => i)

  for (let s = 0; s < sims; s++) {
    const national = normal()
    let demEv = 0
    for (let i = 0; i < units.length; i++) {
      const x = a * national + b * normal()
      margins[i] = thresholds[i] - x
      if (margins[i] > 0) demEv += units[i].ev
    }
    counts[demEv]++
    evSum += demEv
    if (demEv >= needed) dem++
    else if (total - demEv >= needed) rep++
    else {
      tie++
      continue
    }
    // Strongest units for the winner first; the one that crosses the line
    // is the tipping point.
    const demWon = demEv >= needed
    order.sort((i, j) =>
      demWon ? margins[j] - margins[i] : margins[i] - margins[j]
    )
    let running = 0
    for (const i of order) {
      running += units[i].ev
      if (running >= needed) {
        tipping[i]++
        break
      }
    }
  }

  const decided = sims - tie
  return {
    sims,
    rho,
    pDem: dem / sims,
    pRep: rep / sims,
    pTie: tie / sims,
    meanDemEv: evSum / sims,
    distribution: counts.map((c) => c / sims),
    tippingPoints: units
      .map((u, i) => ({
        key: u.key,
        p: decided > 0 ? tipping[i] / decided : 0,
      }))
      .filter((t) => t.p > 0)
      .sort((x, y) => y.p - x.p),
    unitProbs,
  }
}

// Electoral votes the Democrat is favoured in (p > 0.5), the toss-ups, and so
// on: the rating buckets the map's bar is drawn from.
export type RatingBucket =
  | 'safeD'
  | 'likelyD'
  | 'leanD'
  | 'tossup'
  | 'leanR'
  | 'likelyR'
  | 'safeR'

export function ratingOf(pDem: number): RatingBucket {
  const pct = Math.round(pDem * 100)
  if (pct >= 90) return 'safeD'
  if (pct >= 75) return 'likelyD'
  if (pct >= 60) return 'leanD'
  if (pct > 40) return 'tossup'
  if (pct > 25) return 'leanR'
  if (pct > 10) return 'likelyR'
  return 'safeR'
}
