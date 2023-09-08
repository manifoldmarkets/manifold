import {
  BLOCKED_BY_DEFAULT_GROUP_SLUGS,
  DESTINY_GROUP_SLUGS,
} from 'common/envs/constants'
import { useRouter } from 'next/router'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import Welcome from 'web/components/onboarding/welcome'
import { SupabaseContractSearch } from 'web/components/contracts-search'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'

export default function Search() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMobile = useIsMobile()

  useTracking('view search')

  const { query } = useRouter()
  const { q } = query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q

  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  return (
    <>
      <Welcome />
      <Page>
        <SEO
          title="Questions"
          description="Browse all questions."
          url="/questions"
        />
        <Col className="mx-auto w-full p-2">
          <Title className="hidden lg:flex">Questions</Title>
          <SupabaseContractSearch
            persistPrefix="search"
            autoFocus={autoFocus}
            additionalFilter={{
              excludeContractIds: privateUser?.blockedContractIds,
              excludeGroupSlugs: buildArray(
                privateUser?.blockedGroupSlugs,
                shouldFilterDestiny && DESTINY_GROUP_SLUGS,
                !user && BLOCKED_BY_DEFAULT_GROUP_SLUGS
              ),
              excludeUserIds: privateUser?.blockedUserIds,
            }}
            useUrlParams
            isWholePage
            headerClassName={'bg-canvas-0'}
            showCategories
          />
        </Col>
      </Page>
    </>
  )
}
