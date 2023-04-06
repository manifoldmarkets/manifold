import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SupabaseContractSearch } from 'web/components/supabase-search'
import { Title } from 'web/components/widgets/title'
import { useMemberGroupsSubscription } from 'web/hooks/use-group'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'

export default function Search() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMobile = useIsMobile()

  useTracking('view search')

  const { query } = useRouter()
  const { q, s } = query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q && !s

  const followedGroups = useMemberGroupsSubscription(user)
  const shouldFilterDestiny = !followedGroups?.find((g) =>
    DESTINY_GROUP_SLUGS.includes(g.slug)
  )

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <Title className="hidden lg:flex">Markets</Title>
        <SupabaseContractSearch
          persistPrefix="search"
          autoFocus={autoFocus}
          additionalFilter={{
            excludeContractIds: privateUser?.blockedContractIds,
            excludeGroupSlugs: [
              ...(privateUser?.blockedGroupSlugs ?? []),
              ...(shouldFilterDestiny ? DESTINY_GROUP_SLUGS : []),
            ],
            excludeUserIds: privateUser?.blockedUserIds,
            // nonQueryFacetFilters: destinyFilters,
          }}
          isWholePage
        />
      </Col>
    </Page>
  )
}
