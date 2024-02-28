import { useState } from 'react'
import { Change } from 'common/supabase/realtime'
import { useRealtime } from 'web/lib/supabase/realtime/use-realtime'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

const LIVE_TABLES = ['contract_bets', 'contract_comments', 'contracts'] as const
type LiveTable = (typeof LIVE_TABLES)[number]

export default function SupabaseLivePage() {
  const [changes, setChanges] = useState<Change<LiveTable, 'INSERT'>[]>([])
  useRealtime({
    bindings: LIVE_TABLES.map((table) => ({ table, event: 'INSERT' })),
    onChange: (c) => setChanges((xs) => [...xs, c]),
  })

  return (
    <Page trackPageView={false}>
      <SEO title="Supabase live test" description="" url="/supabase-live" />
      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        {changes.map((c, i) => (
          <InsertLog key={i} item={c} />
        ))}
      </Col>
    </Page>
  )
}

const InsertLog = (props: { item: Change<LiveTable, 'INSERT'> }) => {
  const { item } = props
  return <p>${JSON.stringify(item)}</p>
}
