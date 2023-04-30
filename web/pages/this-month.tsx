import { Contract } from 'common/contract'
import { SEASON_END } from 'common/leagues'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

export const getStaticProps = async () => {
  const { data } = await db
    .from('public_open_contracts')
    .select('data')
    .filter('close_time', 'lte', SEASON_END.toISOString())
    .order('data->uniqueBettorCount' as any, { ascending: false })
    .limit(150)

  const contracts = data ? data.map((contract) => contract.data) : []

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
