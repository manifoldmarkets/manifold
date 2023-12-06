import { useCompatibleLovers, useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { Carousel } from 'web/components/widgets/carousel'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { AddAMatchButton } from '../add-a-match-button'
import { MatchTile } from './match-tile'
import { Lover } from 'common/love/lover'
import { BrowseMatchesButton } from '../browse-matches-button'
import { filterDefined } from 'common/util/array'
import { Row } from 'web/components/layout/row'
import {
  areAgeCompatible,
  areGenderCompatible,
  areLocationCompatible,
} from 'love/lib/util/compatibility-util'

export const Matches = (props: {
  profileLover: Lover
  profileUserId: string
}) => {
  const { profileLover, profileUserId } = props
  const lovers = useLovers()
  const matches = useMatches(profileUserId)
  const user = useUser()

  const compatibleLovers = useCompatibleLovers(profileUserId)

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === profileUserId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers
    .filter((l) => l.user_id !== profileUserId)
    .filter((l) => !matchesSet.has(l.user_id))
    .filter((l) => l.looking_for_matches)
    .filter(
      (l) =>
        !lover ||
        (areGenderCompatible(lover, l) &&
          areAgeCompatible(lover, l) &&
          areLocationCompatible(lover, l))
    )

  const currentMatches = matches
    .filter((c) => !c.isResolved)
    .sort((a, b) => {
      const resolvedCountA = a.answers.filter((ans) => ans.resolution).length
      const resolvedCountB = b.answers.filter((ans) => ans.resolution).length

      if (resolvedCountA !== resolvedCountB) {
        return resolvedCountB - resolvedCountA
      }

      return b.answers[resolvedCountB].prob - a.answers[resolvedCountA].prob
    })

  const matchedLovers = filterDefined(
    currentMatches.map((contract) => {
      const matchedLoverId =
        contract.loverUserId1 === profileUserId
          ? contract.loverUserId2
          : contract.loverUserId1
      const matchedLover = lovers.find(
        (lover) => lover.user_id === matchedLoverId
      )
      return matchedLover
    })
  )

  const areYourMatches = profileUserId === user?.id

  return (
    <Col className=" w-full ">
      {currentMatches.length > 0 ? (
        <Col>
          <div className="text-lg font-semibold">
            {currentMatches.length} Matches
          </div>
          <Carousel>
            {currentMatches.map((contract) => {
              const matchedLoverId =
                contract.loverUserId1 === profileUserId
                  ? contract.loverUserId2
                  : contract.loverUserId1
              const matchedLover = lovers.find(
                (lover) =>
                  lover.user_id === matchedLoverId && lover.looking_for_matches
              )
              return (
                matchedLover && (
                  <MatchTile
                    key={contract.id}
                    contract={contract}
                    answers={contract.answers}
                    lover={matchedLover}
                    profileLover={profileLover}
                    isYourMatch={areYourMatches}
                  />
                )
              )
            })}
          </Carousel>
        </Col>
      ) : (
        <></>
      )}

      {lover && (
        <Row className="gap-4">
          <BrowseMatchesButton
            className="flex-1"
            lover={lover}
            potentialLovers={potentialLovers}
            matchedLovers={matchedLovers}
          />
          <AddAMatchButton
            className="flex-1"
            lover={lover}
            potentialLovers={potentialLovers}
          />
        </Row>
      )}
    </Col>
  )
}
