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

export default function Search() {
  const user = useUser()
  const privateUser = usePrivateUser()

  useTracking('view search')

  const { query } = useRouter()
  const { q, s, p } = query
  const autoFocus = !q && !s && !p

  const followedGroups = useMemberGroupsSubscription(user)
  const shouldFilterDestiny = !followedGroups?.find((g) =>
    DESTINY_GROUP_SLUGS.includes(g.slug)
  )
  const destinyFilters = shouldFilterDestiny
    ? DESTINY_GROUP_SLUGS.map((slug) => `groupSlugs:-${slug}`)
    : []

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <Title text="Market search" className="!mt-0" />
        <ContractSearch
          persistPrefix="search"
          autoFocus={autoFocus}
          additionalFilter={{
            facetFilters: getUsersBlockFacetFilters(privateUser),
            nonQueryFacetFilters: destinyFilters,
          }}
          isWholePage
        />
      </Col>
    </Page>
  )
}
