import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Sort, SupabaseContractSearch } from 'web/components/supabase-search'
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
    <Col className="mx-auto w-full">
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
        headerClassName={'bg-canvas-50 !static pt-0'}
        inputRowClassName="hidden"
      />
    </Col>
  )
}
