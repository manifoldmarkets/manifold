import _ = require('lodash')
import { DOMAIN, PROJECT_ID } from '../../common/envs/constants'
import { Answer } from '../../common/answer'
import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { CREATOR_FEE } from '../../common/fees'
import { PrivateUser, User } from '../../common/user'
import { formatMoney, formatPercent } from '../../common/util/format'
import { sendTemplateEmail, sendTextEmail } from './send-email'
import { getPrivateUser, getUser } from './utils'

type market_resolved_template = {
  userId: string
  name: string
  creatorName: string
  question: string
  outcome: string
  investment: string
  payout: string
  url: string
}

const toDisplayResolution = (
  outcome: string,
  prob?: number,
  resolutions?: { [outcome: string]: number }
) => {
  if (outcome === 'MKT' && resolutions) return 'MULTI'

  const display = {
    YES: 'YES',
    NO: 'NO',
    CANCEL: 'N/A',
    MKT: formatPercent(prob ?? 0),
  }[outcome]

  return display === undefined ? `#${outcome}` : display
}

export const sendMarketResolutionEmail = async (
  userId: string,
  investment: number,
  payout: number,
  creator: User,
  contract: Contract,
  resolution: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number }
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

  const outcome = toDisplayResolution(resolution, prob, resolutions)

  const subject = `Resolved ${outcome}: ${contract.question}`

  const templateData: market_resolved_template = {
    userId: user.id,
    name: user.name,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    investment: `${Math.round(investment)}`,
    payout: `${Math.round(payout)}`,
    url: `https://${DOMAIN}/${creator.username}/${contract.slug}`,
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
Austin from Manifold
https://${DOMAIN}/`
  )
}

export const sendMarketCloseEmail = async (
  user: User,
  privateUser: PrivateUser,
  contract: Contract
) => {
  if (
    !privateUser ||
    privateUser.unsubscribedFromResolutionEmails ||
    !privateUser.email
  )
    return

  const { username, name, id: userId } = user
  const firstName = name.split(' ')[0]

  const { question, pool: pools, slug } = contract
  const pool = formatMoney(_.sum(_.values(pools)))
  const url = `https://${DOMAIN}/${username}/${slug}`

  await sendTemplateEmail(
    privateUser.email,
    'Your market has closed',
    'market-close',
    {
      name: firstName,
      question,
      pool,
      url,
      userId,
      creatorFee: (CREATOR_FEE * 100).toString(),
    }
  )
}

export const sendNewCommentEmail = async (
  userId: string,
  commentCreator: User,
  contract: Contract,
  comment: Comment,
  bet: Bet,
  answer?: Answer
) => {
  const privateUser = await getPrivateUser(userId)
  if (
    !privateUser ||
    !privateUser.email ||
    privateUser.unsubscribedFromCommentEmails
  )
    return

  const { question, creatorUsername, slug } = contract
  const marketUrl = `https://${DOMAIN}/${creatorUsername}/${slug}`

  const unsubscribeUrl = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/unsubscribe?id=${userId}&type=market-comment`

  const { name: commentorName, avatarUrl: commentorAvatarUrl } = commentCreator
  const { text } = comment

  const { amount, sale, outcome } = bet
  let betDescription = `${sale ? 'sold' : 'bought'} M$ ${Math.round(amount)}`

  const subject = `Comment on ${question}`
  const from = `${commentorName} <info@manifold.markets>`

  if (contract.outcomeType === 'FREE_RESPONSE') {
    const answerText = answer?.text ?? ''
    const answerNumber = `#${answer?.id ?? ''}`

    await sendTemplateEmail(
      privateUser.email,
      subject,
      'market-answer-comment',
      {
        answer: answerText,
        answerNumber,
        commentorName,
        commentorAvatarUrl: commentorAvatarUrl ?? '',
        comment: text,
        marketUrl,
        unsubscribeUrl,
        betDescription,
      },
      { from }
    )
  } else {
    betDescription = `${betDescription} of ${toDisplayResolution(outcome)}`

    await sendTemplateEmail(
      privateUser.email,
      subject,
      'market-comment',
      {
        commentorName,
        commentorAvatarUrl: commentorAvatarUrl ?? '',
        comment: text,
        marketUrl,
        unsubscribeUrl,
        betDescription,
      },
      { from }
    )
  }
}

export const sendNewAnswerEmail = async (
  answer: Answer,
  contract: Contract
) => {
  // Send to just the creator for now.
  const { creatorId: userId } = contract

  // Don't send the creator's own answers.
  if (answer.userId === userId) return

  const privateUser = await getPrivateUser(userId)
  if (
    !privateUser ||
    !privateUser.email ||
    privateUser.unsubscribedFromAnswerEmails
  )
    return

  const { question, creatorUsername, slug } = contract
  const { name, avatarUrl, text } = answer

  const marketUrl = `https://${DOMAIN}/${creatorUsername}/${slug}`
  const unsubscribeUrl = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/unsubscribe?id=${userId}&type=market-answer`

  const subject = `New answer on ${question}`
  const from = `${name} <info@manifold.markets>`

  await sendTemplateEmail(
    privateUser.email,
    subject,
    'market-answer',
    {
      name,
      avatarUrl: avatarUrl ?? '',
      answer: text,
      marketUrl,
      unsubscribeUrl,
    },
    { from }
  )
}
