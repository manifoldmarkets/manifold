import { useCompatibleLovers } from 'love/hooks/use-lovers'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { AddAMatchButton } from '../add-a-match-button'
import { Lover } from 'common/love/lover'
import { BrowseMatchesButton } from '../browse-matches-button'
import { Row } from 'web/components/layout/row'

export const Matches = (props: {
  profileLover: Lover
  profileUserId: string
}) => {
  const { profileLover, profileUserId } = props
  const data = useCompatibleLovers(profileUserId, {
    sortWithLocationPenalty: true,
  })

  if (!data) return <LoadingIndicator />

  const { lover, matchedLovers, compatibleLovers, loverCompatibilityScores } =
    data

  return (
    lover && (
      <Row className="gap-4">
        <BrowseMatchesButton
          className=""
          lover={lover}
          potentialLovers={[...matchedLovers, ...compatibleLovers]}
          matchedLovers={[]}
          compatibilityScores={loverCompatibilityScores}
        />
        {/* <AddAMatchButton
          className="flex-1"
          lover={lover}
          potentialLovers={compatibleLovers}
        /> */}
      </Row>
    )
  )
}
