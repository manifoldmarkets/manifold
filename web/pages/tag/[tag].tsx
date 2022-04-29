import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { SearchableGrid } from '../../components/contract/contracts-list'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { useContracts } from '../../hooks/use-contracts'
import {
  Contract,
  listTaggedContractsCaseInsensitive,
} from '../../lib/firebase/contracts'

export default function TagPage(props: { contracts: Contract[] }) {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  // mqp: i wrote this in a panic to make the page literally work at all so if you
  // want to e.g. listen for new contracts you may want to fix it up
  const [contracts, setContracts] = useState<Contract[] | 'loading'>('loading')
  useEffect(() => {
    if (tag != null) {
      listTaggedContractsCaseInsensitive(tag).then(setContracts)
    }
  }, [tag])

  if (contracts === 'loading') return <></>

  return (
    <Page>
      <Title text={`#${tag}`} />
      <SearchableGrid contracts={contracts} />
    </Page>
  )
}
