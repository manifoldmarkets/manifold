import { Contract, getContract, setContract } from '../firebase/contracts'
import { User } from '../firebase/users'
import { randomString } from '../util/random-string'
import { slugify } from '../util/slugify'

// consider moving to cloud function for security
export async function createContract(
  question: string,
  description: string,
  initialProb: number,
  creator: User
) {
  const slug = slugify(question).substr(0, 35)

  const preexistingContract = await getContract(slug)

  const contractId = preexistingContract ? slug + '-' + randomString() : slug

  const { startYes, startNo } = calcStartPool(initialProb)

  const contract: Contract = {
    id: contractId,
    outcomeType: 'BINARY',

    creatorId: creator.id,
    creatorName: creator.name,

    question: question.trim(),
    description: description.trim(),

    startPool: { YES: startYes, NO: startNo },
    pool: { YES: startYes, NO: startNo },
    dpmWeights: { YES: 0, NO: 0 },
    isResolved: false,

    // TODO: Set create time to Firestore timestamp
    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),
  }

  await setContract(contract)

  return contract
}

export function calcStartPool(initialProb: number, initialCapital = 100) {
  const p = initialProb / 100.0

  const startYes =
    p === 0.5
      ? p * initialCapital
      : -(initialCapital * (-p + Math.sqrt((-1 + p) * -p))) / (-1 + 2 * p)

  const startNo = initialCapital - startYes

  return { startYes, startNo }
}
