import Router from 'next/router'
import { BinaryContract, contractPath } from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from './add-a-match-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Lover } from 'love/hooks/use-lover'
import { Row } from 'web/components/layout/row'
import { getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import { RejectButton } from './reject-button'
import { useUser } from 'web/hooks/use-user'

export const Matches = (props: { userId: string }) => {
  const { userId } = props
  const lovers = useLovers()
  const matches = useMatches(userId)
  const user = useUser()

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === userId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers.filter(
    (lover) => !matchesSet.has(lover.user_id)
  )
  const currentMatches = matches.filter((c) => !c.isResolved)
  const areYourMatches = userId === user?.id

  return (
    <Col className="bg-canvas-0 max-w-sm gap-4 rounded px-4 py-3">
      {currentMatches.length > 0 && (
        <Col className="gap-2">
          <div className="text-lg font-semibold">
            Chance of 6 month relationship
          </div>
          {currentMatches.map((contract) => {
            const matchedLoverId =
              contract.loverUserId1 === userId
                ? contract.loverUserId2
                : contract.loverUserId1
            const matchedLover = lovers.find(
              (lover) => lover.user_id === matchedLoverId
            )
            return (
              matchedLover && (
                <MatchContract
                  key={contract.id}
                  contract={contract}
                  lover={matchedLover}
                  isYourMatch={areYourMatches}
                />
              )
            )
          })}
        </Col>
      )}

      {lover && (
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}

const MatchContract = (props: {
  contract: BinaryContract
  lover: Lover
  isYourMatch: boolean
}) => {
  const { contract, lover, isYourMatch } = props
  const prob = getProbability(contract)
  const { user } = lover
  return (
    <Row className="justify-between">
      <UserLink name={user.name} username={user.username} />
      <Row className="items-center gap-2">
        <div className="font-semibold">{formatPercent(prob)}</div>
        <Button
          size="xs"
          color="indigo-outline"
          onClick={() => Router.push(contractPath(contract))}
        >
          View
        </Button>
        {isYourMatch && <RejectButton lover={lover} />}
      </Row>
    </Row>
  )
}
