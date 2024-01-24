import { useState } from 'react'

import { useCompatibleLovers } from 'love/hooks/use-lovers'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Lover } from 'common/love/lover'
import { BrowseMatchesButton } from '../browse-matches-button'
import { Row } from 'web/components/layout/row'
import { MatchTile } from './match-tile'
import { Carousel } from 'web/components/widgets/carousel'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'

export const Matches = (props: {
  profileLover: Lover
  profileUserId: string
}) => {
  const { profileLover, profileUserId } = props
  const user = useUser()
  const data = useCompatibleLovers(profileUserId, {
    sortWithLocationPenalty: true,
  })

  const [showOldMatches, setShowOldMatches] = useState(false)

  if (!data) return <LoadingIndicator />

  const {
    lover,
    matchedLovers,
    compatibleLovers,
    loverCompatibilityScores,
    loverContracts,
  } = data
  const areYourMatches = profileUserId === user?.id

  return (
    <Col className="w-full gap-4">
      {lover && (
        <Row className="gap-4">
          <BrowseMatchesButton
            className=""
            lover={lover}
            potentialLovers={[...matchedLovers, ...compatibleLovers]}
            compatibilityScores={loverCompatibilityScores}
          />
        </Row>
      )}
      {loverContracts.length > 0 && (
        <button
          className="text-ink-700 self-start text-sm font-semibold hover:underline active:underline"
          onClick={() => setShowOldMatches(!showOldMatches)}
        >
          {showOldMatches ? 'Hide' : 'Show'} matches
        </button>
      )}
      {showOldMatches && loverContracts.length > 0 ? (
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
    </Col>
  )
}
