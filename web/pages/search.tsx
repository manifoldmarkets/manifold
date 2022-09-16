import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { usePrefetch } from 'web/hooks/use-prefetch'
import { useRouter } from 'next/router'

export default function Search() {
  const user = useUser()
  usePrefetch(user?.id)

  useTracking('view search')

  const { query } = useRouter()
  const autoFocus = !(query['q'] || query['s'] || query['p'])

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <ContractSearch
          user={user}
          persistPrefix="search"
          useQueryUrlParam={true}
          autoFocus={autoFocus}
        />
      </Col>
    </Page>
  )
}
