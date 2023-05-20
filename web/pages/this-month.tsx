import { Contract } from 'common/contract'
import { HOME_BLOCKED_GROUP_SLUGS } from 'common/envs/constants'
import { SEASON_END } from 'common/leagues'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

const blockedGroupSlugs = HOME_BLOCKED_GROUP_SLUGS

export const getStaticProps = async () => {
  const { data } = await db
    .from('public_open_contracts')
    .select('data')
    .filter('close_time', 'lte', SEASON_END.toISOString())
    .filter('data->prob', 'lte', 0.95)
    .filter('data->prob', 'gte', 0.05)
    .order('data->uniqueBettorCount' as any, { ascending: false })
    .limit(100)

  const contracts = (data ?? [])
    .map((row) => {
      delete (row.data as any)?.description
      delete (row.data as any)?.uniqueBettorIds

      return row.data as Contract
    })
    .filter(
      (c) => !c.groupSlugs?.some((slug) => blockedGroupSlugs.includes(slug))
    )

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
