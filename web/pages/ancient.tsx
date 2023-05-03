import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import {
  DESTINY_GROUP_SLUGS,
  HOME_BLOCKED_GROUP_SLUGS,
} from 'common/envs/constants'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { db } from 'web/lib/supabase/db'

const blockedGroupSlugs = [...DESTINY_GROUP_SLUGS, ...HOME_BLOCKED_GROUP_SLUGS]

export const getStaticProps = async () => {
  const pg = await initSupabaseAdmin()
  pg.from('public_open_contracts')
  const { data } = await db
    .from('public_open_contracts')
    .select('data')
    // Excludes markets with recent comments but not recent bets
    .lte('data->lastUpdatedTime', dayjs().subtract(3, 'month').valueOf())
    // Main sort is by lastBetTime with unbet-on markets first, then sorted by most recently updated
    .order('data->lastUpdatedTime' as any, { ascending: true })
    .order('data->lastBetTime' as any, { ascending: true, nullsFirst: true })
    .limit(300)

  const contracts = (data ?? [])
    .map((row) => row.data as Contract)
    .filter(
      (c) => !c.groupSlugs?.some((slug) => blockedGroupSlugs.includes(slug))
    )
    .slice(0, 150)

  return {
    props: {
      contracts,
    },
    revalidate: 60,
  }
}

export default function AncientMarkets(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <Page>
      <Title>Ancient Markets</Title>
      <ContractsTable contracts={contracts} />
    </Page>
  )
}
