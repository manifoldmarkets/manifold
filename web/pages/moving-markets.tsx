import { useAPIGetter } from 'web/hooks/use-api-getter'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { LoadingContractRow } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Pagination } from 'web/components/widgets/pagination'
import { useState } from 'react'

export default function MovingMarketsPage() {
  const [page, setPage] = useState(0)
  const limit = 100

  const { data, error, loading } = useAPIGetter('get-moving-markets', {
    limit,
    offset: page * limit,
  })

  const contracts = data?.contracts ?? []

  return (
    <Page trackPageView="moving-markets">
      <Col className="gap-4">
        <Title>Moving Markets</Title>
        <div className="text-ink-600">
          Markets with significant probability changes in the last 48 hours
        </div>

        {loading && (
          <Col className="gap-2">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <LoadingContractRow key={i} />
              ))}
          </Col>
        )}

        {error && (
          <div className="text-error">
            Error loading markets: {error.message}
          </div>
        )}

        {!loading && !error && (
          <>
            <ContractsTable contracts={contracts} />

            <Pagination
              page={page}
              pageSize={limit}
              totalItems={(data?.contracts?.length ?? 0) + page * limit}
              setPage={setPage}
            />
          </>
        )}
      </Col>
    </Page>
  )
}
