import { convertContract } from 'common/supabase/contracts'
import { runScript } from 'run-script'
import { setAdjustProfitFromResolvedMarkets } from 'shared/helpers/user-contract-metrics'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

runScript(async ({ pg }) => {
  console.log(`deleting all private comments`)
  await pg.none(`delete from contract_comments where visibility = 'private'`)

  const sinclair = await getUser('0k1suGSJKVUnHbCPEhHNpgZPkUP2')
  if (!sinclair) {
    console.error('Sinclair not found')
    process.exit(1)
  }

  console.log('N/A all private markets, except multi indie')
  const contracts = await pg.map(
    `select * from contracts where visibility = 'private'
    and (mechanism != 'cpmm-multi-1'
      or (data->'shouldAnswersSumToOne')::boolean = true)`,
    [],
    convertContract
  )

  for (const contract of contracts) {
    const creator = await getUser(contract.creatorId)
    if (!creator) {
      console.error(`Creator not found for contract ${contract.id}`)
      continue
    }
    await resolveMarketHelper(contract, sinclair, creator, {
      outcome: 'CANCELLED',
    })
    await setAdjustProfitFromResolvedMarkets(contract.id)
  }

  console.log(`overwriting and marking deleted all private binary`)
  await pg.none(
    `update contracts
    set data = data || '{
        "wasPrivate": true,
        "visibility": "unlisted",
        "isRanked": false,
        "deleted": true
        "question": "Private Question (deleted)",
        "description": "",
        "answers": [],
      }'::jsonb
    || jsonb_build_object('slug', 'private-auto-deleted-' || random_alphanumeric(8))
    where visibility = 'private'
    and resolution is null`
  )

  // TODO: multi
  // TODO: redact all answers
})
