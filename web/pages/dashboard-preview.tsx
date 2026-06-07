import { Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { DashboardMarketGrid } from 'web/components/dashboard/dashboard-market-grid'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { api } from 'web/lib/api/api'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'

export default function DashboardPreviewPage() {
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  // TODO prod: replace canEdit with isAdminOrMod || user?.id === dashboard.creatorId
  const canEdit = !!user

  useEffect(() => {
    Promise.allSettled([
      api('search-markets-full', {
        term: '',
        contractType: 'BINARY',
        sort: 'liquidity',
        filter: 'open',
        limit: 6,
      }),
      api('search-markets-full', {
        term: '',
        contractType: 'MULTIPLE_CHOICE',
        sort: 'liquidity',
        filter: 'open',
        limit: 6,
      }),
      api('search-markets-full', {
        term: '',
        contractType: 'BINARY',
        sort: 'resolve-date',
        filter: 'resolved',
        limit: 10,
      }),
    ]).then((results) => {
      const seen = new Set<string>()
      const merged: Contract[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const c of result.value) {
            if (!seen.has(c.id)) {
              seen.add(c.id)
              merged.push(c)
            }
          }
        }
      }
      setContracts(merged)
      setLoading(false)
    })
  }, [])

  return (
    <Page trackPageView="dashboard preview page" className="lg:!col-span-10">
      <Col className="mx-auto w-full max-w-5xl px-4 pb-8">
        <Title className="!mb-0 sm:!mb-0 mb-3 mt-2">Dashboard preview</Title>
        {loading ? (
          <LoadingIndicator />
        ) : (
          <DashboardMarketGrid
            initialContracts={contracts}
            canEdit={canEdit}
            creatorUsername={user?.username}
            trackingLocation="dashboard-preview"
          />
        )}
      </Col>
    </Page>
  )
}
