import { useRouter } from 'next/router'
import { SearchableGrid } from '../../components/contract/contracts-list'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { useContracts } from '../../hooks/use-contracts'
import { Contract, listAllContracts } from '../../lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = await listAllContracts().catch((_) => [])
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

export default function TagPage(props: { contracts: Contract[] }) {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  const contracts = useContracts()

  const taggedContracts = (contracts ?? props.contracts).filter((contract) =>
    contract.lowercaseTags.includes(tag.toLowerCase())
  )

  return (
    <Page>
      <Title text={`#${tag}`} />
      <SearchableGrid contracts={taggedContracts} />
    </Page>
  )
}
