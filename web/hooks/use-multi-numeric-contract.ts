import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { CPMMNumericContract } from 'common/contract'
import { useAnswersCpmm } from 'web/hooks/use-answers'

export const useMultiNumericContract = (
  staticContract: CPMMNumericContract
) => {
  const contract = (useFirebasePublicContract(
    staticContract.visibility,
    staticContract.id
  ) ?? staticContract) as CPMMNumericContract
  const liveAnswers = useAnswersCpmm(contract.id)
  if (liveAnswers) {
    contract.answers = liveAnswers
  }
  return contract
}
