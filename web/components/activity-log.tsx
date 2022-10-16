import { Contract } from 'common/contract'
import { keyBy, range, groupBy } from 'lodash'
import { useLiveBets } from 'web/hooks/use-bets'
import { useContracts } from 'web/hooks/use-contracts'
import { ContractMention } from './contract/contract-mention'
import { FeedBet } from './feed/feed-bets'
import { Col } from './layout/col'

export function ActivityLog(props: { count: number }) {
  const { count } = props
  const bets = useLiveBets(count * 2) ?? []
  const contracts = useContracts(bets.map((b) => b.contractId))
  const contractsById = keyBy(contracts, 'id')
  const startIndex =
    range(0, bets.length - count).find((i) =>
      range(i, i + count).every((j) => contracts[j])
    ) ?? 0

  const betSubset = bets.slice(startIndex, startIndex + count)
  const allLoaded = betSubset.every((b) => contractsById[b.contractId])

  const groups = Object.entries(groupBy(betSubset, (b) => b.contractId)).map(
    ([contractId, bets]) => ({
      contractId,
      bets,
    })
  )

  return (
    <Col className="divide-y border">
      {allLoaded &&
        groups.map(({ contractId, bets }) => {
          const contract = contractsById[contractId] as Contract
          return (
            <Col key={contractId} className="gap-2 bg-white px-6 py-4 ">
              <ContractMention contract={contract} />
              {bets.map((bet) => (
                <FeedBet
                  className="!pt-0"
                  key={bet.id}
                  contract={contract}
                  bet={bet}
                  avatarSize="xs"
                />
              ))}
            </Col>
          )
        })}
    </Col>
  )
}
