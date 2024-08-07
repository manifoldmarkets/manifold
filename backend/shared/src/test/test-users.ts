import { log } from 'shared/monitoring/log'
import { incrementBalance } from 'shared/supabase/users'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'

export const getTestUsersForBetting = async (pg: SupabaseDirectClient) => {
  const privateUsers = await pg.map(
    `select id, data->>'apiKey' as api_key from private_users
              where data->>'email' ilike '%manifoldtestnewuser%'
              limit 150`,
    [],
    (r) => ({ id: r.id as string, apiKey: r.api_key as string })
  )
  log('got private users')
  await Promise.all(
    privateUsers.map((pu) =>
      incrementBalance(pg, pu.id, {
        balance: 10000,
        totalDeposits: 10000,
      })
    )
  )
  log(`${privateUsers.length} user balances incremented by 1000`)
  await Promise.all(
    privateUsers
      .filter((p) => !p.apiKey)
      .map(async (p) => {
        return await pg.none(
          `update private_users set data = data || $2 where id = $1`,
          [p.id, JSON.stringify({ apiKey: crypto.randomUUID() })]
        )
      })
  )
  log('generated api keys for users')
  return privateUsers
}

export const getRandomTestBet = (
  contract: Contract,
  enableLimitOrders: boolean
) => {
  const limitProb = !enableLimitOrders
    ? undefined
    : Math.random() > 0.5
    ? parseFloat(Math.random().toPrecision(1))
    : undefined

  const betData = removeUndefinedProps({
    contractId: contract.id,
    amount: Math.random() * 100 + 1,
    outcome: Math.random() > 0.5 ? ('YES' as const) : ('NO' as const),
    answerId:
      contract.mechanism === 'cpmm-multi-1'
        ? contract.answers[Math.floor(Math.random() * contract.answers.length)]
            ?.id
        : undefined,
    limitProb: !limitProb
      ? undefined
      : limitProb < 0.01
      ? 0.01
      : limitProb > 0.99
      ? 0.99
      : limitProb,
  })
  return betData
}
