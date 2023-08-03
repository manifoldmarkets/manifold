import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import Welcome from 'web/components/onboarding/welcome'
import { Sort, SupabaseContractSearch } from 'web/components/supabase-search'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'

export default function Search() {
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
    <>
      <Welcome />
      <Page>
        <Col className="mx-auto w-full p-2">
          <Title className="hidden lg:flex">Questions</Title>
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
            useUrlParams
            isWholePage
            headerClassName={'bg-canvas-0'}
            showTopics
          />
        </Col>
      </Page>
    </>
  )
}
