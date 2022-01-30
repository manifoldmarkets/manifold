import { getProbability } from '../../common/calculate'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { formatPercent } from '../../common/util/format'
import { sendTemplateEmail } from './send-email'
import { getPrivateUser, getUser } from './utils'

type market_resolved_template = {
  userId: string
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
  const privateUser = await getPrivateUser(userId)
  if (
    !privateUser ||
    privateUser.unsubscribedFromResolutionEmails ||
    !privateUser.email
  )
    return

  const user = await getUser(userId)
  if (!user) return

  const prob = formatPercent(getProbability(contract.totalShares))
  const outcome = toDisplayResolution[resolution].replace('PROB', prob)

  const subject = `Resolved ${outcome}: ${contract.question}`

  const templateData: market_resolved_template = {
    userId: user.id,
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

  await sendTemplateEmail(
    privateUser.email,
    subject,
    'market-resolved',
    templateData
  )
}

const toDisplayResolution = { YES: 'YES', NO: 'NO', CANCEL: 'N/A', MKT: 'PROB' }
