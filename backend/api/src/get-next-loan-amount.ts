import { type APIHandler } from './helpers/endpoint'
import { getNextLoanAmountResults } from 'api/request-loan'

export const getNextLoanAmount: APIHandler<'get-next-loan-amount'> = async ({
  userId,
}) => {
  try {
    const { result } = await getNextLoanAmountResults(userId)
    return { amount: result.payout }
  } catch (e) {
    return { amount: 0 }
  }
}
