import { runScript } from 'run-script'
import { tsToMillis } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'

if (require.main === module) {
  runScript(async ({ firestore, pg }) => {
    const resolvedAnswers = await pg.map(
      `select answers.id, answers.contract_id, contracts.resolution_time, contracts.data->>'resolverId' as resolver_id from answers
             join contracts on answers.contract_id = contracts.id
       where resolution_time is not null
         and mechanism = 'cpmm-multi-1'
      `,
      [],
      (row) => ({
        id: row.id as string,
        resolutionTime: tsToMillis(row.resolution_time),
        contractId: row.contract_id as string,
        resolverId: row.resolver_id ? (row.resolver_id as string) : undefined,
      })
    )

    for (const answer of resolvedAnswers) {
      console.log('update answer', answer.id)
      await firestore
        .doc(`contracts/${answer.contractId}/answersCpmm/${answer.id}`)
        .update(
          removeUndefinedProps({
            resolutionTime: answer.resolutionTime,
            resolverId: answer.resolverId,
          })
        )
    }
  })
}
