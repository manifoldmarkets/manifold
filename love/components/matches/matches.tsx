import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { areGenderCompatible } from 'love/lib/util/gender'
import { Col } from 'web/components/layout/col'
import { Carousel } from 'web/components/widgets/carousel'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { AddAMatchButton } from '../add-a-match-button'
import { MatchTile } from './match-tile'
import { User } from 'common/user'
import { Lover } from 'common/love/lover'

export const Matches = (props: {
  profileLover: Lover
  profileUserId: string
}) => {
  const { profileLover, profileUserId } = props
  const lovers = useLovers()
  const matches = useMatches(profileUserId)
  const user = useUser()

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === profileUserId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers
    .filter((l) => l.user_id !== profileUserId)
    .filter((l) => !matchesSet.has(l.user_id))
    .filter((l) => !lover || areGenderCompatible(lover, l))
    .filter((l) => l.looking_for_matches)

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
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}
