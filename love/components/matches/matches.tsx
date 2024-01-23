import { useCompatibleLovers } from 'love/hooks/use-lovers'
import { Col } from 'web/components/layout/col'
import { Carousel } from 'web/components/widgets/carousel'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { AddAMatchButton } from '../add-a-match-button'
import { MatchTile } from './match-tile'
import { Lover } from 'common/love/lover'
import { BrowseMatchesButton } from '../browse-matches-button'
import { Row } from 'web/components/layout/row'

export const Matches = (props: {
  profileLover: Lover
  profileUserId: string
}) => {
  const { profileLover, profileUserId } = props
  const user = useUser()

  const data = useCompatibleLovers(profileUserId, {
    sortWithLocationPenalty: true,
  })

  if (!data) return <LoadingIndicator />

  const {
    lover,
    matchedLovers,
    compatibleLovers,
    loverContracts,
    loverCompatibilityScores,
  } = data

  const areYourMatches = profileUserId === user?.id

  return (
    <Col className=" w-full ">
      {loverContracts.length > 0 ? (
        <Col>
          <div className="text-lg font-semibold">
            {loverContracts.length} Matches
          </div>
          <Carousel>
            {loverContracts.map((contract) => {
              const matchedLoverId =
                contract.loverUserId1 === profileUserId
                  ? contract.loverUserId2
                  : contract.loverUserId1
              const matchedLover = matchedLovers.find(
                (lover) => lover.user_id === matchedLoverId
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
            potentialLovers={compatibleLovers}
            matchedLovers={matchedLovers}
            compatibilityScores={loverCompatibilityScores}
          />
          <AddAMatchButton
            className="flex-1"
            lover={lover}
            potentialLovers={compatibleLovers}
          />
        </Row>
      )}
    </Col>
  )
}
