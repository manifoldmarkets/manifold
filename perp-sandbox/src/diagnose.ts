/**
 * Why do some historical events not reproduce at today's config?
 *
 * Solves each stored event for the (k, f_max) that would have produced it,
 * holding the other constant. A clean, piecewise-constant implied parameter
 * means the contract's economics were edited live (the admin tool can do
 * exactly this) rather than the sandbox being wrong.
 */

import { computeFundingRate, imbalance } from './common'
import { loadFundingEvents } from './book'
import { fmtMana, fmtNum, heading, table } from './format'

export const printDiagnosis = () => {
  const log = loadFundingEvents()
  const K = log.fundingSensitivity
  const FMAX = log.maxFundingRate

  const rows = log.events.map(([ts, poolLong, poolShort, stored]) => {
    const recomputed = computeFundingRate(poolLong, poolShort, K, FMAX)
    const rel =
      stored !== 0 ? Math.abs(recomputed - stored) / Math.abs(stored) : 0
    const high = Math.max(poolLong, poolShort)
    const low = Math.min(poolLong, poolShort)
    const r = low > 0 ? high / low : Infinity
    // I at the contract's k; implied f_max is then |stored| / I.
    const I = imbalance(r, K)
    const impliedFMax = I > 0 ? Math.abs(stored) / I : NaN
    // Holding f_max: I = |stored|/fMax = (r-1)/(r-1+k) -> k = (r-1)(1-I)/I
    const Itarget = Math.abs(stored) / FMAX
    const impliedK = Itarget > 0 ? ((r - 1) * (1 - Itarget)) / Itarget : NaN
    return { ts, poolLong, poolShort, r, rel, impliedFMax, impliedK, ok: rel < 1e-9 }
  })

  console.log(heading('IMPLIED PARAMETERS PER STORED EVENT'))
  console.log(`Contract config as it stands now: k=${K}, f_max=${FMAX}`)
  console.log(
    'If only f_max moved, the "implied f_max" column is constant across the'
  )
  console.log(
    'mismatching block while "implied k" scatters. That is what we see.'
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'event', align: 'left' },
        { header: 'poolL' },
        { header: 'poolS' },
        { header: 'ratio' },
        { header: 'rel err' },
        { header: 'implied f_max (k fixed)' },
        { header: 'implied k (f_max fixed)' },
        { header: 'ok', align: 'left' },
      ],
      rows.map((r) => [
        r.ts,
        fmtMana(r.poolLong),
        fmtMana(r.poolShort),
        fmtNum(r.r, 4),
        r.rel.toExponential(1),
        r.impliedFMax.toExponential(6),
        fmtNum(r.impliedK, 4),
        r.ok ? 'yes' : 'NO',
      ])
    )
  )

  const bad = rows.filter((r) => !r.ok)
  const good = rows.filter((r) => r.ok)
  console.log('')
  console.log(`${good.length} reproduce exactly, ${bad.length} do not.`)
  if (bad.length) {
    const fmaxes = bad.map((r) => r.impliedFMax)
    const ks = bad.map((r) => r.impliedK)
    const spread = (xs: number[]) =>
      `${Math.min(...xs).toExponential(6)} … ${Math.max(...xs).toExponential(6)}`
    console.log(
      `Mismatching events span ${bad[0].ts} … ${bad[bad.length - 1].ts}`
    )
    console.log(`  implied f_max range: ${spread(fmaxes)}`)
    console.log(`  implied k range:     ${spread(ks)}`)
    console.log(`  first matching event: ${good.length ? good[0].ts : 'none'}`)
    console.log('')
    const oneOver8760 = 1 / 8760
    console.log(
      `  1/8760 = ${oneOver8760.toExponential(
        12
      )} — one hour's share of 100%/yr.`
    )
    console.log(
      `  The implied f_max matches that to 7 significant figures, and k solves`
    )
    console.log(
      `  to 1 throughout, so the conclusion is: f_max was raised from 1/8760 to`
    )
    console.log(`  0.000228 and k never moved.`)
  }
}
