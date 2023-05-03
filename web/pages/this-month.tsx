import { Contract } from 'common/contract'
import {
  DESTINY_GROUP_SLUGS,
  HOME_BLOCKED_GROUP_SLUGS,
} from 'common/envs/constants'
import { SEASON_END } from 'common/leagues'
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
    .filter('close_time', 'lte', SEASON_END.toISOString())
    .filter('data->prob', 'lte', 0.95)
    .filter('data->prob', 'gte', 0.05)
    // Couldn't get this to work...
    // .not('data->groupSlugs', 'cs', '{"destinygg"}')
    .order('data->uniqueBettorCount' as any, { ascending: false })
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

export default function ThisMonth(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <Page>
      <Title>Ending this month</Title>
      <ContractsTable contracts={contracts} />
    </Page>
  )
}
