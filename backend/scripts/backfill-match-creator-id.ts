import { Bet } from 'common/bet'
import { runScript } from './run-script'
import { Contract } from 'common/contract'
import { manifoldLoveUserId } from 'common/love/constants'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const loverContracts = await pg.map<Contract>(
      `
    select data from contracts
    where data->>'loverUserId1' is not null
    and outcome_type = 'MULTIPLE_CHOICE'
    `,
      [],
      (r) => r.data
    )

    const contractsWithoutMatchCreatorId = loverContracts.filter(
      (c) => !c.matchCreatorId
    )

    const getFirstBettor = async (contract: Contract) => {
      const bet = await pg.oneOrNone<Bet>(
        `
      select data from contract_bets
      where contract_id = $1
      and user_id != $2
      order by created_time asc
      limit 1
      `,
        [contract.id, manifoldLoveUserId],
        (r) => (r ? r.data : null)
      )
      if (!bet) return manifoldLoveUserId
      return bet.userId
    }

    for (const contract of contractsWithoutMatchCreatorId) {
      const firstBettorId = await getFirstBettor(contract)
      console.log(
        'contract',
        contract.id,
        contract.question,
        'firstBettorId',
        firstBettorId
      )
      await firestore.collection('contracts').doc(contract.id).update({
        matchCreatorId: firstBettorId,
      })
    }

    console.log('Done')
  })
}
