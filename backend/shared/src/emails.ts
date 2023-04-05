import { DOMAIN, ENV_CONFIG } from 'common/envs/constants'
import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { Contract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
} from 'common/util/format'
import { getValueFromBucket } from 'common/calculate-dpm'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { sendTemplateEmail, sendTextEmail } from './send-email'
import { contractUrl, getUser, log } from 'shared/utils'
import { getContractOGProps } from 'common/contract-seo'
import {
  notification_reason_types,
  NotificationReason,
} from 'common/notification'
import { Dictionary } from 'lodash'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { buildOgUrl } from 'common/util/og'
import { removeUndefinedProps } from 'common/util/object'

export type PerContractInvestmentsData = {
  questionTitle: string
  questionUrl: string
  questionProb: string
  profitStyle: string
  currentValue: number
  pastValue: number
  profit: number
}

export type OverallPerformanceData = {
  profit: string
  prediction_streak: string
  markets_traded: string
  profit_style: string
  likes_received: string
  markets_created: string
  unique_bettors: string
}

export const emailMoneyFormat = (amount: number) => {
  return formatMoney(amount).replace(ENV_CONFIG.moneyMoniker, 'M')
}

export const sendMarketResolutionEmail = async (
  reason: notification_reason_types,
  privateUser: PrivateUser,
  investment: number,
  payout: number,
  creator: User,
  creatorPayout: number,
  contract: Contract,
  resolution: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number }
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser || !privateUser.email || !sendToEmail) return

  const user = await getUser(privateUser.id)
  if (!user) return

  const outcome = toDisplayResolution(
    contract,
    resolution,
    resolutionProbability,
    resolutions
  )

  const subject = `Resolved ${outcome}: ${contract.question}`

  const creatorPayoutText =
    creatorPayout >= 1 && privateUser.id === creator.id
      ? ` (plus ${emailMoneyFormat(creatorPayout)} in commissions)`
      : ''

  const correctedInvestment =
    Number.isNaN(investment) || investment < 0 ? 0 : investment

  const displayedInvestment = emailMoneyFormat(correctedInvestment)
  const displayedPayout = emailMoneyFormat(payout)

  const templateData: market_resolved_template = {
    userId: user.id,
    name: user.name,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    investment: displayedInvestment,
    payout: displayedPayout + creatorPayoutText,
    url: `https://${DOMAIN}/${creator.username}/${contract.slug}`,
    unsubscribeUrl,
  }

  // Modify template here:
  // https://app.mailgun.com/app/sending/domains/mg.manifold.markets/templates/edit/market-resolved/initial

  return await sendTemplateEmail(
    privateUser.email,
    subject,
    correctedInvestment === 0 ? 'market-resolved-no-bets' : 'market-resolved',
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
  if (contract.outcomeType === 'CERT') {
    return resolution + ' (CERT)'
  }
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
    const { resolution, resolutionValue } = contract

    if (resolution === 'CANCEL') return 'N/A'

    return resolutionValue
      ? formatLargeNumber(resolutionValue)
      : formatNumericProbability(
          resolutionProbability ?? getProbability(contract),
          contract
        )
  }
  if (contract.outcomeType === 'STONK') {
    return formatNumericProbability(getProbability(contract), contract)
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

  const { name } = user
  const firstName = name.split(' ')[0]

  const { unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )

  return await sendTemplateEmail(
    privateUser.email,
    'Welcome to Manifold Markets!',
    'welcome',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendPersonalFollowupEmail = async (
  user: User,
  privateUser: PrivateUser,
  sendTime: string
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]

  const emailBody = `Hi ${firstName},

Thanks for signing up! I'm one of the cofounders of Manifold Markets, and was wondering how you've found your experience on the platform so far?

If you haven't already, I encourage you to try creating your own prediction market (https://manifold.markets/create) and joining our Discord chat (https://discord.com/invite/eHQBNBqXuh).

Feel free to reply to this email with any questions or concerns you have.

Cheers,

James
Cofounder of Manifold Markets
https://manifold.markets
 `

  await sendTextEmail(
    privateUser.email,
    'How are you finding Manifold?',
    emailBody,
    {
      from: 'James from Manifold <james@manifold.markets>',
      'o:deliverytime': sendTime,
    }
  )
}

export const sendCreatorGuideEmail = async (
  user: User,
  privateUser: PrivateUser,
  sendTime: string
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  if (!sendToEmail) return
  return await sendTemplateEmail(
    privateUser.email,
    'Create your own prediction market',
    'creating-market',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
      'o:deliverytime': sendTime,
    }
  )
}

export const sendThankYouEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'thank_you_for_purchases'
  )

  if (!sendToEmail) return
  return await sendTemplateEmail(
    privateUser.email,
    'Thanks for your Manifold purchase',
    'thank-you',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendMarketCloseEmail = async (
  reason: notification_reason_types,
  user: User,
  privateUser: PrivateUser,
  contract: Contract
) => {
  if (!privateUser.email) return

  const { username, name, id: userId } = user
  const firstName = name.split(' ')[0]

  const { question, slug, volume } = contract

  const url = `https://${DOMAIN}/${username}/${slug}`

  // We ignore if they were able to unsubscribe from market close emails, this is a necessary email
  return await sendTemplateEmail(
    privateUser.email,
    'Your market has closed',
    'market-close',
    {
      question,
      url,
      unsubscribeUrl: '',
      userId,
      name: firstName,
      volume: emailMoneyFormat(volume),
    }
  )
}

export const sendNewCommentEmail = async (
  reason: NotificationReason,
  privateUser: PrivateUser,
  commentCreator: User,
  contract: Contract,
  commentText: string,
  commentId: string,
  bet?: Bet,
  answerText?: string,
  answerId?: string
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser || !privateUser.email || !sendToEmail) return

  const { question } = contract
  const marketUrl = `https://${DOMAIN}/${contract.creatorUsername}/${contract.slug}#${commentId}`

  const { name: commentorName, avatarUrl: commentorAvatarUrl } = commentCreator

  let betDescription = ''
  if (bet) {
    const { amount, sale } = bet
    betDescription = `${
      sale || amount < 0 ? 'sold' : 'bought'
    } ${emailMoneyFormat(Math.abs(amount))}`
  }

  const subject = `Comment on ${question}`
  const from = `${commentorName} on Manifold <no-reply@manifold.markets>`

  if (contract.outcomeType === 'FREE_RESPONSE' && answerId && answerText) {
    const answerNumber = answerId ? `#${answerId}` : ''

    return await sendTemplateEmail(
      privateUser.email,
      subject,
      'market-answer-comment',
      {
        answer: answerText,
        answerNumber,
        commentorName,
        commentorAvatarUrl: commentorAvatarUrl ?? '',
        comment: commentText,
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
        comment: commentText,
        marketUrl,
        unsubscribeUrl,
        betDescription,
      },
      { from }
    )
  }
}

export const sendNewAnswerEmail = async (
  reason: notification_reason_types,
  privateUser: PrivateUser,
  name: string,
  text: string,
  contract: Contract,
  avatarUrl?: string
) => {
  const { creatorId } = contract
  // Don't send the creator's own answers.
  if (privateUser.id === creatorId) return

  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return

  const { question, creatorUsername, slug } = contract

  const marketUrl = `https://${DOMAIN}/${creatorUsername}/${slug}`

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

export const sendInterestingMarketsEmail = async (
  user: User,
  privateUser: PrivateUser,
  contractsToSend: Contract[],
  deliveryTime?: string
) => {
  if (!privateUser || !privateUser.email) return

  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'trending_markets'
  )
  if (!sendToEmail) return

  const { name } = user
  const firstName = name.split(' ')[0]

  await sendTemplateEmail(
    privateUser.email,
    `${contractsToSend[0].question} & 5 more interesting markets on Manifold`,
    'interesting-markets',
    {
      name: firstName,
      unsubscribeUrl,

      question1Title: contractsToSend[0].question,
      question1Link: contractUrl(contractsToSend[0]),
      question1ImgSrc: imageSourceUrl(contractsToSend[0]),
      question2Title: contractsToSend[1].question,
      question2Link: contractUrl(contractsToSend[1]),
      question2ImgSrc: imageSourceUrl(contractsToSend[1]),
      question3Title: contractsToSend[2].question,
      question3Link: contractUrl(contractsToSend[2]),
      question3ImgSrc: imageSourceUrl(contractsToSend[2]),
      question4Title: contractsToSend[3].question,
      question4Link: contractUrl(contractsToSend[3]),
      question4ImgSrc: imageSourceUrl(contractsToSend[3]),
      question5Title: contractsToSend[4].question,
      question5Link: contractUrl(contractsToSend[4]),
      question5ImgSrc: imageSourceUrl(contractsToSend[4]),
      question6Title: contractsToSend[5].question,
      question6Link: contractUrl(contractsToSend[5]),
      question6ImgSrc: imageSourceUrl(contractsToSend[5]),
    },
    deliveryTime ? { 'o:deliverytime': deliveryTime } : undefined
  )
}

function imageSourceUrl(contract: Contract) {
  // TODO: get bet points into image so interesting markets can see the image
  return buildOgUrl(
    removeUndefinedProps(getContractOGProps(contract)),
    'market'
  )
}

export const sendNewFollowedMarketEmail = async (
  reason: notification_reason_types,
  userId: string,
  privateUser: PrivateUser,
  contract: Contract
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const user = await getUser(privateUser.id)
  if (!user) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const creatorName = contract.creatorName

  const questionImgSrc = imageSourceUrl(contract)
  console.log('questionImgSrc', questionImgSrc)
  return await sendTemplateEmail(
    privateUser.email,
    `${creatorName} asked ${contract.question}`,
    'new-market-from-followed-user',
    {
      name: firstName,
      creatorName,
      unsubscribeUrl,
      questionTitle: contract.question,
      questionUrl: contractUrl(contract),
      questionImgSrc,
    },
    {
      from: `${creatorName} on Manifold <no-reply@manifold.markets>`,
    }
  )
}
export const sendNewUniqueBettorsEmail = async (
  reason: notification_reason_types,
  userId: string,
  privateUser: PrivateUser,
  contract: Contract,
  totalPredictors: number,
  newPredictors: User[],
  userBets: Dictionary<[Bet, ...Bet[]]>,
  bonusAmount: number
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const user = await getUser(privateUser.id)
  if (!user) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const creatorName = contract.creatorName
  // make the emails stack for the same contract
  const subject = `You made a popular market! ${
    contract.question.length > 50
      ? contract.question.slice(0, 50) + '...'
      : contract.question
  } just got ${
    newPredictors.length
  } new predictions. Check out who's predicting on it inside.`
  const templateData: Record<string, string> = {
    name: firstName,
    creatorName,
    totalPredictors: totalPredictors.toString(),
    bonusString: emailMoneyFormat(bonusAmount),
    marketTitle: contract.question,
    marketUrl: contractUrl(contract),
    unsubscribeUrl,
    newPredictors: newPredictors.length.toString(),
  }

  newPredictors.forEach((p, i) => {
    templateData[`bettor${i + 1}Name`] = p.name
    if (p.avatarUrl) templateData[`bettor${i + 1}AvatarUrl`] = p.avatarUrl
    const bet = userBets[p.id][0]
    if (bet) {
      const { amount, sale } = bet
      templateData[`bet${i + 1}Description`] = `${
        sale || amount < 0 ? 'sold' : 'bought'
      } ${emailMoneyFormat(Math.abs(amount))}`
    }
  })

  return await sendTemplateEmail(
    privateUser.email,
    subject,
    newPredictors.length === 1 ? 'new-unique-bettor' : 'new-unique-bettors',
    templateData,
    {
      from: `Manifold Markets <no-reply@manifold.markets>`,
    }
  )
}

export const sendWeeklyPortfolioUpdateEmail = async (
  user: User,
  privateUser: PrivateUser,
  investments: PerContractInvestmentsData[],
  overallPerformance: OverallPerformanceData,
  moversToSend: number
) => {
  if (!privateUser || !privateUser.email) return

  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'profit_loss_updates'
  )

  if (!sendToEmail) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const templateData: Record<string, string> = {
    name: firstName,
    unsubscribeUrl,
    ...overallPerformance,
  }
  for (let i = 0; i < moversToSend; i++) {
    const investment = investments[i]
    if (investment) {
      templateData[`question${i + 1}Title`] = investment.questionTitle
      templateData[`question${i + 1}Url`] = investment.questionUrl
      templateData[`question${i + 1}Prob`] = investment.questionProb
      templateData[`question${i + 1}Change`] = emailMoneyFormat(
        investment.profit
      )
      templateData[`question${i + 1}ChangeStyle`] = investment.profitStyle
      templateData[`question${i + 1}Display`] = 'display: table-row'
    } else templateData[`question${i + 1}Display`] = 'display: none'
  }

  await sendTemplateEmail(
    privateUser.email,
    // 'iansphilips@gmail.com',
    `Here's your weekly portfolio update!`,
    'portfolio-update',
    templateData
  )
  log('Sent portfolio update email to', privateUser.email)
}
