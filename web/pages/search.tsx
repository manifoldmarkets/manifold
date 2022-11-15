import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { usePrefetch } from 'web/hooks/use-prefetch'
import { useRouter } from 'next/router'
import { getUsersBlockFacetFilters } from 'web/lib/firebase/users'

export default function Search() {
  const user = useUser()
  const privateUser = usePrivateUser()
  usePrefetch(user?.id)

  useTracking('view search')

  const { query } = useRouter()
  const { q, s, p } = query
  const autoFocus = !q && !s && !p

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <ContractSearch
          user={user}
          persistPrefix="search"
          useQueryUrlParam={true}
          autoFocus={autoFocus}
          additionalFilter={{
            facetFilters: getUsersBlockFacetFilters(privateUser),
          }}
          isWholePage
        />
      </Col>
    </Page>
  )
}
