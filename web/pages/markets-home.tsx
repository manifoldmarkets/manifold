import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { DailyStats } from 'web/components/daily-stats'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { Sort, SupabaseContractSearch } from 'web/components/supabase-search'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'

export default function MarketsHome() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMobile = useIsMobile()

  useTracking('view search')

  const { query } = useRouter()
  const { q, s } = query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q && !s

  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <Row className="mb-4 items-center justify-between gap-4 sm:mb-8">
          <Title children="Home" className="!my-0 hidden sm:block" />
          <div className="flex sm:hidden">
            {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
          </div>
          <DailyStats user={user} />
        </Row>

        <SupabaseContractSearch
          persistPrefix="search"
          autoFocus={autoFocus}
          defaultSort={(s as Sort) || 'score'}
          additionalFilter={{
            excludeContractIds: privateUser?.blockedContractIds,
            excludeGroupSlugs: [
              ...(privateUser?.blockedGroupSlugs ?? []),
              ...(shouldFilterDestiny ? DESTINY_GROUP_SLUGS : []),
            ],
            excludeUserIds: privateUser?.blockedUserIds,
          }}
          isWholePage
          showTopics={true}
        />
      </Col>
    </Page>
  )
}
