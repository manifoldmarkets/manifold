import * as _ from 'lodash'
import { Contract } from './contract'
import { filterDefined } from './util/array'
import { addObjects } from './util/object'

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
