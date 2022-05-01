import * as _ from 'lodash'
import { Bet } from './bet'
import { Contract } from './contract'
import { ClickEvent } from './tracking'
import { filterDefined } from './util/array'
import { addObjects } from './util/object'

export const MAX_FEED_CONTRACTS = 75

export const getRecommendedContracts = (
  contractsById: { [contractId: string]: Contract },
  yourBetOnContractIds: string[]
) => {
  const contracts = Object.values(contractsById)
  const yourContracts = filterDefined(
    yourBetOnContractIds.map((contractId) => contractsById[contractId])
  )

  const yourContractIds = new Set(yourContracts.map((c) => c.id))
  const notYourContracts = contracts.filter((c) => !yourContractIds.has(c.id))

  const yourWordFrequency = contractsToWordFrequency(yourContracts)
  const otherWordFrequency = contractsToWordFrequency(notYourContracts)
  const words = _.union(
    Object.keys(yourWordFrequency),
    Object.keys(otherWordFrequency)
  )

  const yourWeightedFrequency = _.fromPairs(
    _.map(words, (word) => {
      const [yourFreq, otherFreq] = [
        yourWordFrequency[word] ?? 0,
        otherWordFrequency[word] ?? 0,
      ]

      const score = yourFreq / (yourFreq + otherFreq + 0.0001)

      return [word, score]
    })
  )

  // console.log(
  //   'your weighted frequency',
  //   _.sortBy(_.toPairs(yourWeightedFrequency), ([, freq]) => -freq)
  // )

  const scoredContracts = contracts.map((contract) => {
    const wordFrequency = contractToWordFrequency(contract)

    const score = _.sumBy(Object.keys(wordFrequency), (word) => {
      const wordFreq = wordFrequency[word] ?? 0
      const weight = yourWeightedFrequency[word] ?? 0
      return wordFreq * weight
    })

    return {
      contract,
      score,
    }
  })

  return _.sortBy(scoredContracts, (scored) => -scored.score).map(
    (scored) => scored.contract
  )
}

const contractToText = (contract: Contract) => {
  const { description, question, tags, creatorUsername } = contract
  return `${creatorUsername} ${question} ${tags.join(' ')} ${description}`
}

const getWordsCount = (text: string) => {
  const normalizedText = text.replace(/[^a-zA-Z]/g, ' ').toLowerCase()
  const words = normalizedText.split(' ').filter((word) => word)

  const counts: { [word: string]: number } = {}
  for (const word of words) {
    if (counts[word]) counts[word]++
    else counts[word] = 1
  }
  return counts
}

const toFrequency = (counts: { [word: string]: number }) => {
  const total = _.sum(Object.values(counts))
  return _.mapValues(counts, (count) => count / total)
}

const contractToWordFrequency = (contract: Contract) =>
  toFrequency(getWordsCount(contractToText(contract)))

const contractsToWordFrequency = (contracts: Contract[]) => {
  const frequencySum = contracts
    .map(contractToWordFrequency)
    .reduce(addObjects, {})

  return toFrequency(frequencySum)
}

export const getWordScores = (
  contracts: Contract[],
  contractViewCounts: { [contractId: string]: number },
  clicks: ClickEvent[],
  bets: Bet[]
) => {
  const contractClicks = _.groupBy(clicks, (click) => click.contractId)
  const contractBets = _.groupBy(bets, (bet) => bet.contractId)

  const yourContracts = contracts.filter(
    (c) =>
      contractViewCounts[c.id] || contractClicks[c.id] || contractBets[c.id]
  )
  const yourTfIdf = calculateContractTfIdf(yourContracts)

  const contractWordScores = _.mapValues(
    yourTfIdf,
    (wordsTfIdf, contractId) => {
      const viewCount = contractViewCounts[contractId] ?? 0
      const clickCount = contractClicks[contractId]?.length ?? 0
      const betCount = contractBets[contractId]?.length ?? 0

      const factor =
        -1 * Math.log(viewCount + 1) +
        10 * Math.log(betCount + clickCount / 4 + 1)

      return _.mapValues(wordsTfIdf, (tfIdf) => tfIdf * factor)
    }
  )

  const wordScores = Object.values(contractWordScores).reduce(addObjects, {})
  const minScore = Math.min(...Object.values(wordScores))
  const maxScore = Math.max(...Object.values(wordScores))
  const normalizedWordScores = _.mapValues(
    wordScores,
    (score) => (score - minScore) / (maxScore - minScore)
  )

  // console.log(
  //   'your word scores',
  //   _.sortBy(_.toPairs(normalizedWordScores), ([, score]) => -score).slice(0, 100),
  //   _.sortBy(_.toPairs(normalizedWordScores), ([, score]) => -score).slice(-100)
  // )

  return normalizedWordScores
}

export function getContractScore(
  contract: Contract,
  wordScores: { [word: string]: number }
) {
  if (Object.keys(wordScores).length === 0) return 1

  const wordFrequency = contractToWordFrequency(contract)
  const score = _.sumBy(Object.keys(wordFrequency), (word) => {
    const wordFreq = wordFrequency[word] ?? 0
    const weight = wordScores[word] ?? 0
    return wordFreq * weight
  })

  return score
}

// Caluculate Term Frequency-Inverse Document Frequency (TF-IDF):
// https://medium.datadriveninvestor.com/tf-idf-in-natural-language-processing-8db8ef4a7736
function calculateContractTfIdf(contracts: Contract[]) {
  const contractFreq = contracts.map((c) => contractToWordFrequency(c))
  const contractWords = contractFreq.map((freq) => Object.keys(freq))

  const wordsCount: { [word: string]: number } = {}
  for (const words of contractWords) {
    for (const word of words) {
      wordsCount[word] = (wordsCount[word] ?? 0) + 1
    }
  }

  const wordIdf = _.mapValues(wordsCount, (count) =>
    Math.log(contracts.length / count)
  )
  const contractWordsTfIdf = _.map(contractFreq, (wordFreq) =>
    _.mapValues(wordFreq, (freq, word) => freq * wordIdf[word])
  )
  return _.fromPairs(contracts.map((c, i) => [c.id, contractWordsTfIdf[i]]))
}
