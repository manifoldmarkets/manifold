import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { getUsersBlockFacetFilters } from 'web/lib/firebase/users'
import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { useMemberGroupsSubscription } from 'web/hooks/use-group'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { SupabaseContractSearch } from 'web/components/supabase-search'

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
  const destinyFilters = shouldFilterDestiny
    ? DESTINY_GROUP_SLUGS.map((slug) => `groupSlugs:-${slug}`)
    : []

  console.log('SHOULD FILTER', shouldFilterDestiny)
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
