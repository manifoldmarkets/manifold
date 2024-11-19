import {
  getContract,
  getUser,
  htmlToRichText,
  log,
  revalidateContractStaticProps,
} from './utils'
import { runTxnOutsideBetQueue } from './txn/run-txn'
import { APIError } from 'common/api/utils'
import { updateContract } from './supabase/contracts'
import { randomString } from 'common/util/random'
import { getNewContract } from 'common/new-contract'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { clamp } from 'lodash'
import { runTransactionWithRetries } from './transact-with-retries'
import { answerToRow, getAnswersForContract } from './supabase/answers'
import { Answer } from 'common/answer'
import { bulkInsertQuery } from './supabase/utils'
import { pgp } from './supabase/init'
import { generateAntes } from 'shared/create-contract-helpers'

// cribbed from backend/api/src/create-market.ts

export async function createCashContractMain(
  manaContractId: string,
  subsidyAmount: number,
  myId: string
) {
  const { cashContract, manaContract } = await runTransactionWithRetries(
    async (tx) => {
      const manaContract = await getContract(tx, manaContractId)
      if (!manaContract) {
        throw new APIError(404, `Mana contract ${manaContractId} not found`)
      }

      const creator = await getUser(manaContract.creatorId)

      if (!creator) {
        throw new APIError(404, `Creator ${manaContract.creatorId} not found`)
      }

      if (manaContract.token !== 'MANA') {
        throw new APIError(
          400,
          `Contract ${manaContractId} is not a MANA contract`
        )
      }

      if (manaContract.siblingContractId) {
        throw new APIError(
          400,
          `Contract ${manaContractId} already has a sweepstakes sibling contract ${manaContract.siblingContractId}`
        )
      }

      if (
        manaContract.outcomeType !== 'BINARY' &&
        manaContract.outcomeType !== 'MULTIPLE_CHOICE' &&
        manaContract.outcomeType !== 'PSEUDO_NUMERIC' &&
        manaContract.outcomeType !== 'NUMBER'
      ) {
        throw new APIError(
          400,
          `Cannot make sweepstakes question for ${manaContract.outcomeType} contract ${manaContractId}`
        )
      }

      let answers: Answer[] = []
      if (manaContract.outcomeType === 'MULTIPLE_CHOICE') {
        if (manaContract.addAnswersMode === 'ANYONE')
          throw new APIError(
            400,
            `Cannot make sweepstakes question for free response contract`
          )

        answers = await getAnswersForContract(tx, manaContractId)
      }

      const initialProb =
        manaContract.mechanism === 'cpmm-1'
          ? clamp(Math.round(manaContract.prob * 100), 1, 99)
          : 50

      const min = 'min' in manaContract ? manaContract.min : 0
      const max = 'max' in manaContract ? manaContract.max : 0
      const isLogScale =
        'isLogScale' in manaContract ? manaContract.isLogScale : false

      const contract = getNewContract({
        id: randomString(),
        ante: subsidyAmount,
        token: 'CASH',
        description: htmlToRichText('<p></p>'),
        initialProb,
        creator,
        slug: manaContract.slug + '--cash',
        question: manaContract.question,
        outcomeType: manaContract.outcomeType,
        closeTime: manaContract.closeTime,
        visibility: manaContract.visibility,
        isTwitchContract: manaContract.isTwitchContract,

        min,
        max,
        isLogScale,

        answers: answers.filter((a) => !a.isOther).map((a) => a.text), // Other gets recreated

        ...(manaContract.outcomeType === 'MULTIPLE_CHOICE'
          ? {
              addAnswersMode: manaContract.addAnswersMode,
              shouldAnswersSumToOne: manaContract.shouldAnswersSumToOne,
            }
          : {}),
      })

      // copy answer colors and set userId to subsidizer
      const answersToInsert =
        'answers' in contract &&
        contract.answers?.map((a: Answer) => ({
          ...a,
          userId: myId,
          color: answers.find((b) => b.index === a.index)?.color,
        }))

      const insertAnswersQuery = answersToInsert
        ? bulkInsertQuery('answers', answersToInsert.map(answerToRow))
        : `select 1 where false`

      // TODO: initialize marke tier?

      const contractQuery = pgp.as.format(
        `insert into contracts (id, data, token) values ($1, $2, $3) returning *`,
        [contract.id, JSON.stringify(contract), contract.token]
      )

      const [newContracts, newAnswers] = await tx.multi(
        `${contractQuery};
         ${insertAnswersQuery};`
      )

      const cashContract = convertContract(newContracts[0])
      if (newAnswers.length > 0 && cashContract.mechanism === 'cpmm-multi-1') {
        cashContract.answers = newAnswers.map(convertAnswer)
      }

      // Set sibling contract IDs
      await updateContract(tx, manaContractId, {
        siblingContractId: cashContract.id,
      })
      await updateContract(tx, cashContract.id, {
        siblingContractId: manaContractId,
      })

      // Add initial liquidity
      await runTxnOutsideBetQueue(tx, {
        fromId: myId,
        fromType: 'USER',
        toId: cashContract.id,
        toType: 'CONTRACT',
        amount: subsidyAmount,
        token: 'CASH',
        category: 'CREATE_CONTRACT_ANTE',
      })

      log(
        `Created cash contract ${cashContract.id} for mana contract ${manaContractId}`
      )

      await generateAntes(
        tx,
        myId,
        cashContract,
        contract.outcomeType,
        subsidyAmount,
        subsidyAmount
      )

      return { cashContract, manaContract }
    }
  )

  await revalidateContractStaticProps(manaContract)
  return cashContract
}
