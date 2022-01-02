import { sendEmail } from './send-email'
import { Contract } from './types/contract'
import { User } from './types/user'
import { getUser } from './utils'

export const sendMarketResolutionEmail = async (
  userId: string,
  payout: number,
  creator: User,
  contract: Contract,
  resolution: 'YES' | 'NO' | 'CANCEL' | 'MKT'
) => {
  const user = await getUser(userId)
  if (!user) return

  const subject = `Resolved ${toDisplayResolution[resolution]}: ${contract.question}`

  const body = `Dear ${user.name},

A market you bet in has been resolved!

Creator: ${contract.creatorName}
Question: ${contract.question}
Resolution: ${toDisplayResolution[resolution]}

Your payout is M$ ${Math.round(payout)}

View the market here:
https://mantic.markets/${creator.username}/${contract.slug}
`
  await sendEmail(user.email, subject, body)
}

const toDisplayResolution = { YES: 'YES', NO: 'NO', CANCEL: 'N/A', MKT: 'MKT' }
