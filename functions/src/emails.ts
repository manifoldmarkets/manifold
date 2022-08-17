import { DOMAIN } from '../../common/envs/constants'
import { Answer } from '../../common/answer'
import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { DPM_CREATOR_FEE } from '../../common/fees'
import { PrivateUser, User } from '../../common/user'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
} from '../../common/util/format'
import { getValueFromBucket } from '../../common/calculate-dpm'
import { formatNumericProbability } from '../../common/pseudo-numeric'

import { sendTemplateEmail } from './send-email'
import { getPrivateUser, getUser } from './utils'
import { getFunctionUrl } from '../../common/api'
import { richTextToString } from '../../common/util/parse'
import { buildCardUrl, getOpenGraphProps } from '../../common/contract-details'

const UNSUBSCRIBE_ENDPOINT = getFunctionUrl('unsubscribe')

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

  const emailType = 'market-resolved'
  const unsubscribeUrl = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  const templateData: market_resolved_template = {
    userId: user.id,
    name: user.name,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    investment: `${Math.floor(investment)}`,
    payout: `${Math.floor(payout)}${creatorPayoutText}`,
    url: `https://${DOMAIN}/${creator.username}/${contract.slug}`,
    unsubscribeUrl,
  }

  // Modify template here:
  // https://app.mailgun.com/app/sending/domains/mg.manifold.markets/templates/edit/market-resolved/initial

  return await sendTemplateEmail(
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
  unsubscribeUrl: string
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

  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    const { resolutionValue } = contract

    return resolutionValue
      ? formatLargeNumber(resolutionValue)
      : formatNumericProbability(
          resolutionProbability ?? getProbability(contract),
          contract
        )
  }

  if (resolution === 'MKT' && resolutions) return 'MULTI'
  if (resolution === 'CANCEL') return 'N/A'

  if (contract.outcomeType === 'NUMERIC' && contract.mechanism === 'dpm-2')
    return (
      contract.resolutionValue?.toString() ??
      getValueFromBucket(resolution, contract).toString()
    )

  const answer = contract.answers.find((a) => a.id === resolution)
  if (answer) return answer.text
  return `#${resolution}`
}

export const sendWelcomeEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (!privateUser || !privateUser.email) return

  const { name, id: userId } = user
  const firstName = name.split(' ')[0]

  const emailType = 'generic'
  const unsubscribeLink = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  return await sendTemplateEmail(
    privateUser.email,
    'Welcome to Manifold Markets!',
    'welcome',
    {
      name: firstName,
      unsubscribeLink,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendOneWeekBonusEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (
    !privateUser ||
    !privateUser.email ||
    privateUser.unsubscribedFromGenericEmails
  )
    return

  const { name, id: userId } = user
  const firstName = name.split(' ')[0]

  const emailType = 'generic'
  const unsubscribeLink = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  return await sendTemplateEmail(
    privateUser.email,
    'Manifold Markets one week anniversary gift',
    'one-week',
    {
      name: firstName,
      unsubscribeLink,
      manalink: 'https://manifold.markets/link/lj4JbBvE',
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendThankYouEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (
    !privateUser ||
    !privateUser.email ||
    privateUser.unsubscribedFromGenericEmails
  )
    return

  const { name, id: userId } = user
  const firstName = name.split(' ')[0]

  const emailType = 'generic'
  const unsubscribeLink = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  return await sendTemplateEmail(
    privateUser.email,
    'Thanks for your Manifold purchase',
    'thank-you',
    {
      name: firstName,
      unsubscribeLink,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
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
  const emailType = 'market-resolve'
  const unsubscribeUrl = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  return await sendTemplateEmail(
    privateUser.email,
    'Your market has closed',
    'market-close',
    {
      question,
      url,
      unsubscribeUrl,
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
  answerText?: string,
  answerId?: string
) => {
  const privateUser = await getPrivateUser(userId)
  if (
    !privateUser ||
    !privateUser.email ||
    privateUser.unsubscribedFromCommentEmails
  )
    return

  const { question, creatorUsername, slug } = contract
  const marketUrl = `https://${DOMAIN}/${creatorUsername}/${slug}#${comment.id}`
  const emailType = 'market-comment'
  const unsubscribeUrl = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  const { name: commentorName, avatarUrl: commentorAvatarUrl } = commentCreator
  const { content } = comment
  const text = richTextToString(content)

  let betDescription = ''
  if (bet) {
    const { amount, sale } = bet
    betDescription = `${sale || amount < 0 ? 'sold' : 'bought'} ${formatMoney(
      Math.abs(amount)
    )}`
  }

  const subject = `Comment on ${question}`
  const from = `${commentorName} on Manifold <no-reply@manifold.markets>`

  if (contract.outcomeType === 'FREE_RESPONSE' && answerId && answerText) {
    const answerNumber = `#${answerId}`

    return await sendTemplateEmail(
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
    return await sendTemplateEmail(
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
  const emailType = 'market-answer'
  const unsubscribeUrl = `${UNSUBSCRIBE_ENDPOINT}?id=${userId}&type=${emailType}`

  const subject = `New answer on ${question}`
  const from = `${name} <info@manifold.markets>`

  return await sendTemplateEmail(
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

export const sendThreeContractsEmail = async (
  privateUser: PrivateUser,
  contractsToSend: Contract[]
) => {
  const emailType = 'weekly-trending'
  const unsubscribeUrl = `${UNSUBSCRIBE_ENDPOINT}?id=${privateUser.id}&type=${emailType}`
  if (!privateUser || !privateUser.email) return
  await sendTemplateEmail(
    privateUser.email,
    contractsToSend[0].question + ' and 2 more questions for you.',
    '3-trending-markets',
    {
      question1Title: contractsToSend[0].question,
      question1Description: getTextDescription(contractsToSend[0]),
      question1Link: contractUrl(contractsToSend[0]),
      question1ImgSrc: imageSourceUrl(contractsToSend[0]),
      question2Title: contractsToSend[1].question,
      question2Description: getTextDescription(contractsToSend[1]),
      question2Link: contractUrl(contractsToSend[1]),
      question2ImgSrc: imageSourceUrl(contractsToSend[1]),
      question3Title: contractsToSend[2].question,
      question3Description: getTextDescription(contractsToSend[2]),
      question3Link: contractUrl(contractsToSend[2]),
      question3ImgSrc: imageSourceUrl(contractsToSend[2]),

      unsubscribeLink: unsubscribeUrl,
    }
  )
}

function getTextDescription(contract: Contract) {
  const { description } = contract
  let text = ''
  if (typeof description === 'string') text = description
  else text = richTextToString(description)

  if (text.length > 300) {
    return text.substring(0, 300) + '...'
  }
  return text
}

function contractUrl(contract: Contract) {
  return `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`
}

function imageSourceUrl(contract: Contract) {
  return buildCardUrl(getOpenGraphProps(contract))
}
