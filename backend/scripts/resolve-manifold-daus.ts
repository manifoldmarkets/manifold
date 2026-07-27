import { resolvePerp } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-shot: resolve the derelict April manifold-daus dev perp. Its feed died
// June 10, it has zero open positions, and its hourly staleness ERROR was
// the dominant source of alert emails.

const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'

if (require.main === module)
  runScript(async ({ pg }) => {
    const c = await pg.one(
      `select id from contracts where slug = 'manifold-daus' and mechanism = 'perp'`
    )
    const res = await resolvePerp(c.id, DEV_MANIFOLD)
    log(
      `resolved ${c.id} at ${res.finalPrice}: ${res.closedPositions.length} positions closed, residual ${res.residualPayout.toFixed(0)} to creator`
    )
  })
