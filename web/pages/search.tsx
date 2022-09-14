import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { usePrefetch } from 'web/hooks/use-prefetch'

export default function Search() {
  const user = useUser()
  usePrefetch(user?.id)

  useTracking('view search')

  return (
    <Page>
      <Col className="mx-auto w-full p-2">
        <ContractSearch
          user={user}
          persistPrefix="search"
          useQueryUrlParam={true}
        />
      </Col>
    </Page>
  )
}
