import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { sendTemplateEmail } from './send-email'
import { getUser } from './utils'

type market_resolved_template = {
  name: string
  creatorName: string
  question: string
  outcome: string
  payout: string
  url: string
}

export const sendMarketResolutionEmail = async (
  userId: string,
  payout: number,
  creator: User,
  contract: Contract,
  resolution: 'YES' | 'NO' | 'CANCEL' | 'MKT'
) => {
  const user = await getUser(userId)
  if (!user) return

  const outcome = toDisplayResolution[resolution]

  const subject = `Resolved ${outcome}: ${contract.question}`

  const templateData: market_resolved_template = {
    name: user.name,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    payout: `${Math.round(payout)}`,
    url: `https://manifold.markets/${creator.username}/${contract.slug}`,
  }

  // Modify template here:
  // https://app.mailgun.com/app/sending/domains/mg.manifold.markets/templates/edit/market-resolved/initial
  // Mailgun username: james@mantic.markets

  await sendTemplateEmail(user.email, subject, 'market-resolved', templateData)
}

const toDisplayResolution = { YES: 'YES', NO: 'NO', CANCEL: 'N/A', MKT: 'MKT' }
