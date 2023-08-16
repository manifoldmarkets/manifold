import { Contract } from 'common/contract'
import { DEEMPHASIZED_GROUP_SLUGS } from 'common/envs/constants'
import { CURRENT_SEASON, getSeasonDates } from 'common/leagues'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

const blockedGroupSlugs = DEEMPHASIZED_GROUP_SLUGS

export const getStaticProps = async () => {
  const { data } = await db
    .from('public_open_contracts')
    .select('data')
    .filter(
      'close_time',
      'lte',
      getSeasonDates(CURRENT_SEASON).end.toISOString()
    )
    .filter('data->prob', 'lte', 0.95)
    .filter('data->prob', 'gte', 0.05)
    .order('data->uniqueBettorCount' as any, { ascending: false })
    .limit(100)

  const contracts = (data ?? [])
    .map((row) => {
      delete (row.data as any)?.description
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
