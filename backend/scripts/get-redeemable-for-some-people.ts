import { runScript } from 'run-script'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'

runScript(async ({ pg }) => {
  // get some users somehow
  // in this case, winners of https://manifold.markets/ManifoldPolitics/will-trump-win-the-2024-election--cash
  const ids = await pg.map(
    `select user_id from user_contract_metrics where contract_id = 'icotel6eaq'
    and (has_yes_shares = true or has_no_shares = true)
    order by profit desc limit 100`,
    [],
    (r) => r.user_id
  )

  for (const id of ids) {
    const redeemable = await calculateRedeemablePrizeCash(pg, id)
    console.log(id, redeemable)
  }
})
