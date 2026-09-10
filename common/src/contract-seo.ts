import { Contract, MultiContract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import { getAnswerProbability, getDisplayProbability } from './calculate'
import { richTextToString } from './util/parse'
import { formatMoneyNumberUSLocale, formatPercent } from './util/format'
import { getFormattedNumberExpectedValue } from 'common/number'
import { Answer, sortAnswers } from './answer'
import { getFormattedExpectedValue } from './multi-numeric'
import { getFormattedExpectedDate } from './multi-date'
import { formatPrice, inferPriceDecimals } from './perps/format'

// Bump when the card layout or the encoding of its params changes. The image
// URL is cached for a year, and the edge route decodes `points` by version.
export const OG_CARD_VERSION = '3'
// How many answers a multiple choice card shows, and how long each can be
export const OG_CARD_MAX_ANSWERS = 3
export const OG_CARD_MAX_ANSWER_LENGTH = 60

export type OgAnswer = {
  t: string // answer text
  p: string // formatted percent
  w?: true // winner of a resolved market
}

export const getContractOGProps = (
  contract: Contract
): Omit<OgCardProps, 'points'> => {
  const {
    resolution,
    uniqueBettorCount,
    volume,
    question,
    creatorName,
    outcomeType,
    creatorAvatarUrl,
  } = contract

  // Canceled markets show the "Canceled" state instead of answers
  const rankedAnswers =
    outcomeType === 'MULTIPLE_CHOICE' && resolution !== 'CANCEL'
      ? getRankedOgAnswers(contract as MultiContract)
      : []
  const topAnswer = rankedAnswers[0]

  const probPercent =
    outcomeType === 'BINARY'
      ? formatPercent(getDisplayProbability(contract))
      : topAnswer?.p

  const numericValue =
    outcomeType === 'NUMBER'
      ? getFormattedNumberExpectedValue(contract)
      : outcomeType === 'MULTI_NUMERIC'
      ? getFormattedExpectedValue(contract)
      : outcomeType === 'DATE'
      ? getFormattedExpectedDate(contract)
      : outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'STONK'
      ? getFormattedMappedValue(contract, getDisplayProbability(contract))
      : undefined

  const bountyLeft =
    outcomeType === 'BOUNTIED_QUESTION'
      ? formatMoneyNumberUSLocale(contract.bountyLeft)
      : undefined
  const perpPrice = getFormattedPerpPrice(contract)

  return {
    v: OG_CARD_VERSION,
    question,
    numTraders: (uniqueBettorCount ?? 0).toString(),
    volume: Math.floor(volume).toString(),
    probability: probPercent,
    creatorName,
    creatorAvatarUrl,
    numericValue,
    resolution,
    topAnswer: topAnswer?.t,
    answers: rankedAnswers.length ? JSON.stringify(rankedAnswers) : undefined,
    bountyLeft: bountyLeft,
    ...(outcomeType === 'PERP' ? { outcomeType } : {}),
    ...(perpPrice === undefined ? {} : { perpPrice }),
  }
}

// Winners first, then by probability (the app's own ordering), capped at what
// fits on the card
function getRankedOgAnswers(contract: MultiContract): OgAnswer[] {
  const { resolutions } = contract
  // Mirrors the answer components: a resolved market's percentages come from
  // contract.resolutions (whole-market resolution) or the answer's own
  // resolution (independent answers), never from its pools
  const resolvedShare = (a: Answer) =>
    a.resolution && a.resolution !== 'CANCEL'
      ? getAnswerProbability(contract, a.id)
      : resolutions
      ? (resolutions[a.id] ?? 0) / 100
      : undefined

  return sortAnswers(contract, contract.answers, 'prob-desc')
    .slice(0, OG_CARD_MAX_ANSWERS)
    .map((a) => {
      const share = resolvedShare(a)
      return {
        t: truncateAnswerText(a.text),
        p: formatOgPercent(share ?? getAnswerProbability(contract, a.id)),
        ...(share ? { w: true as const } : {}),
      }
    })
}

// Answer text that fits on one row of the card
function truncateAnswerText(text: string) {
  return text.length > OG_CARD_MAX_ANSWER_LENGTH
    ? text.slice(0, OG_CARD_MAX_ANSWER_LENGTH - 1).trimEnd() + '…'
    : text
}

// formatPercent shows tails to one decimal ("100.0%"); resolved answers
// should read as whole numbers on the card
function formatOgPercent(prob: number) {
  return prob === 0 || prob === 1 ? `${prob * 100}%` : formatPercent(prob)
}

export type OgCardProps = {
  v?: string // OG_CARD_VERSION; absent on URLs built before versioning
  question: string
  numTraders: string // number
  volume: string // number
  probability?: string
  creatorName: string
  creatorAvatarUrl?: string
  numericValue?: string
  resolution?: string
  topAnswer?: string
  answers?: string // JSON-encoded OgAnswer[]
  bountyLeft?: string // number
  outcomeType?: 'PERP'
  perpPrice?: string
  points?: string // base64ified points
}

// Included in every market's meta/og description so link previews (Reddit,
// Discord, X, etc.) make clear this is a play-money game, not gambling.
export const PLAY_MONEY_BLURB = 'Free to play with play money.'

export function getSeoDescription(contract: Contract) {
  const { description: desc, resolution } = contract

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)
  const perpPrice = getFormattedPerpPrice(contract)

  const prefix =
    contract.outcomeType === 'PERP'
      ? perpPrice === undefined
        ? 'Perpetual market. '
        : contract.isResolved
        ? `Perpetual market settled at ${perpPrice}. `
        : `Perpetual market. Oracle price: ${perpPrice}. `
      : resolution
      ? `Resolved ${getResolvedValue(contract) || resolution}. `
      : contract.outcomeType === 'BINARY'
      ? `${formatPercent(getDisplayProbability(contract))} chance. `
      : contract.outcomeType === 'PSEUDO_NUMERIC'
      ? `${getFormattedMappedValue(
          contract,
          getDisplayProbability(contract)
        )} expected. `
      : ''

  return (prefix + PLAY_MONEY_BLURB + ' ' + stringDesc).trim()
}

function getFormattedPerpPrice(contract: Contract) {
  if (contract.outcomeType !== 'PERP') {
    return undefined
  }
  const price =
    contract.isResolved &&
    typeof contract.resolvedOraclePrice === 'number' &&
    Number.isFinite(contract.resolvedOraclePrice)
      ? contract.resolvedOraclePrice
      : contract.oraclePrice
  if (!Number.isFinite(price)) return undefined

  return formatPrice(price, inferPriceDecimals([price]))
}

function getResolvedValue(contract: Contract) {
  if (contract.resolution === 'MKT') {
    if (
      contract.outcomeType === 'BINARY' &&
      contract.resolutionProbability != undefined
    ) {
      return formatPercent(contract.resolutionProbability)
    }
    if (
      contract.outcomeType === 'PSEUDO_NUMERIC' &&
      contract.resolutionValue != undefined
    ) {
      return contract.resolutionValue
    }
  }
  return null
}
