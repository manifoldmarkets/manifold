import { Contract } from 'common/contract'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

export const getStaticProps = async () => {
  const { data } = await db.rpc('get_noob_questions')

  return { props: { contracts: data } }
}

export default function Newbies(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <Page trackPageView={'newbies page'}>
      <Title className="!mb-2">Questions by new users</Title>
      <p className="text-ink-700 mb-4">plz be nice!</p>
      <ContractsTable contracts={contracts} />
    </Page>
  )
}
