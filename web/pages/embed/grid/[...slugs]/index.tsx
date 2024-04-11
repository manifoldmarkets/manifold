import { Contract } from 'web/lib/firebase/contracts'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { getContractFromSlug } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { filterDefined } from 'common/util/array'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const contracts = filterDefined(
    await Promise.all(slugs.map((slug) => getContractFromSlug(slug, db)))
  )

  return {
    props: {
      contracts,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractGridPage(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <>
      <ContractsGrid
        contracts={contracts}
        breakpointColumns={{ default: 2, 650: 1 }}
      />
    </>
  )
}
