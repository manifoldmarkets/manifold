import * as _ from 'lodash'

import { DOMAIN, PROJECT_ID } from 'common/envs/constants'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, FreeResponseContract } from 'common/contract'
import { DPM_CREATOR_FEE } from 'common/fees'
import { PrivateUser, User } from 'common/user'
import { formatMoney, formatPercent } from 'common/util/format'
import { sendTemplateEmail, sendTextEmail } from './send-email'
import { getPrivateUser, getUser } from './utils'

export const sendMarketResolutionEmail = async (
  userId: string,
  investment: number,
  payout: number,
  creator: User,
  creatorPayout: number,
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

  const outcome = toDisplayResolution(
    contract,
    resolution,
    resolutionProbability,
    resolutions
  )

  const subject = `Resolved ${outcome}: ${contract.question}`

  const creatorPayoutText =
    userId === creator.id
      ? ` (plus ${formatMoney(creatorPayout)} in commissions)`
      : ''

  const templateData: market_resolved_template = {
    userId: user.id,
    name: user.name,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    investment: `${Math.floor(investment)}`,
    payout: `${Math.floor(payout)}${creatorPayoutText}`,
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
  contract: Contract,
  resolution: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number }
) => {
  if (contract.outcomeType === 'BINARY') {
    const prob = resolutionProbability ?? getProbability(contract)

    const display = {
      YES: 'YES',
      NO: 'NO',
      CANCEL: 'N/A',
      MKT: formatPercent(prob ?? 0),
    }[resolution]

    return display || resolution
  }

  if (resolution === 'MKT' && resolutions) return 'MULTI'
  if (resolution === 'CANCEL') return 'N/A'

  const answer = (contract as FreeResponseContract).answers?.find(
    (a) => a.id === resolution
  )
  if (answer) return answer.text
  return `#${resolution}`
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

  const { question, slug, volume, mechanism, collectedFees } = contract

  const url = `https://${DOMAIN}/${username}/${slug}`

  await sendTemplateEmail(
    privateUser.email,
    'Your market has closed',
    'market-close',
    {
      question,
      url,
      userId,
      name: firstName,
      volume: formatMoney(volume),
      creatorFee:
        mechanism === 'dpm-2'
          ? `${DPM_CREATOR_FEE * 100}% of the profits`
          : formatMoney(collectedFees.creatorFee),
    }
  )
}

export const sendNewCommentEmail = async (
  userId: string,
  commentCreator: User,
  contract: Contract,
  comment: Comment,
  bet?: Bet,
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

  let betDescription = ''
  if (bet) {
    const { amount, sale } = bet
    betDescription = `${sale || amount < 0 ? 'sold' : 'bought'} ${formatMoney(
      Math.abs(amount)
    )}`
  }

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
    if (bet) {
      betDescription = `${betDescription} of ${toDisplayResolution(
        contract,
        bet.outcome
      )}`
    }
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
