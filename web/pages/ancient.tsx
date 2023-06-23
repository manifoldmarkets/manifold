import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

export const getStaticProps = async () => {
  const { data } = await db
    .from('public_open_contracts')
    .select('data')
    // Excludes markets with recent comments but not recent bets
    .lte('data->lastUpdatedTime', dayjs().subtract(3, 'month').valueOf())
    // Put markets with no bets first
    .order('data->lastBetTime' as any, { ascending: true, nullsFirst: true })
    .limit(100)

  const contracts = (data ?? []).map((row) => {
    delete (row.data as any)?.description
    return row.data as Contract
  })

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
      <Title>Ancient Questions</Title>
      <ContractsTable contracts={contracts} />
    </Page>
  )
}
