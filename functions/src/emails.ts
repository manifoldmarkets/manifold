import { getProbability } from '../../common/calculate'
import { Contract } from '../../common/contract'
import { PrivateUser, User } from '../../common/user'
import { formatPercent } from '../../common/util/format'
import { sendTemplateEmail, sendTextEmail } from './send-email'
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
  resolution: 'YES' | 'NO' | 'CANCEL' | 'MKT',
  resolutionProbability?: number
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

  const prob = resolutionProbability ?? getProbability(contract.totalShares)

  const toDisplayResolution = {
    YES: 'YES',
    NO: 'NO',
    CANCEL: 'N/A',
    MKT: formatPercent(prob),
  }
  const outcome = toDisplayResolution[resolution]

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

export const sendWelcomeEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  const firstName = user.name.split(' ')[0]

  await sendTextEmail(
    privateUser.email || '',
    'Welcome to Manifold Markets!',
    `Hi ${firstName},

Thanks for joining us! We can't wait to see what markets you create.
Questions? Feedback? I'd love to hear from you - just reply to this email!
Or come chat with us on Discord: https://discord.gg/eHQBNBqXuh

Best,
Austin from Manifold`
  )
}

export const sendMarketCloseEmail = async (
  user: User,
  privateUser: PrivateUser,
  contract: Contract
) => {
  const firstName = user.name.split(' ')[0]
  const url = `https://manifold.markets/${user.username}/${contract.slug}`

  await sendTextEmail(
    privateUser.email || '',
    'Your market has closed',
    `Hi ${firstName},

Trading for one of your markets has ended. Please resolve it as soon as possible.

Question: ${contract.question}
Url: ${url}

Best,
Austin from Manifold`
  )
}
