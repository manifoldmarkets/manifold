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
    // Should really be based off last bet time, but this still guarantees antiquity
    .filter(
      'data->lastUpdatedTime',
      'lte',
      dayjs().subtract(3, 'month').valueOf()
    )
    // .filter('data->prob', 'lte', 0.95)
    // .filter('data->prob', 'gte', 0.05)
    // Couldn't get this to work...
    // .not('data->groupSlugs', 'cs', '{"destinygg"}')
    .order('data->lastUpdatedTime' as any, { ascending: true })
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
