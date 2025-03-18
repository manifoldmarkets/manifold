import { getCpmmInitialLiquidity } from 'common/antes'
import { BinaryContract, CPMMMultiContract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { runScript } from 'run-script'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { contractColumnsToSelect } from 'shared/utils'

runScript(async ({ pg }) => {
  const contracts = await pg.map(
    `
        select ${contractColumnsToSelect} from contracts
        where (outcome_type = 'MULTI_NUMERIC' or outcome_type = 'DATE')
        and created_time < now() 
        `,
    [],
    convertContract
  )

  for (const contract of contracts) {
    const providerId = contract.creatorId

    if (
      contract.mechanism === 'cpmm-multi-1' &&
      !contract.shouldAnswersSumToOne
    ) {
      const { answers } = contract
      for (const answer of answers) {
        const ante = Math.sqrt(answer.poolYes * answer.poolNo)

        const lp = getCpmmInitialLiquidity(
          providerId,
          contract,
          ante,
          contract.createdTime,
          answer.id
        )

        await insertLiquidity(pg, lp)
      }
    } else if (
      contract.mechanism === 'cpmm-multi-1' ||
      contract.mechanism === 'cpmm-1'
    ) {
      const lp = getCpmmInitialLiquidity(
        providerId,
        contract as BinaryContract | CPMMMultiContract,
        contract.totalLiquidity,
        contract.createdTime
      )

      await insertLiquidity(pg, lp)
    }
  }
})
