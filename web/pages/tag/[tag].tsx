import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { SearchableGrid } from 'web/components/contract/contracts-list'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import {
  Contract,
  listTaggedContractsCaseInsensitive,
} from 'web/lib/firebase/contracts'

export default function TagPage() {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  // mqp: i wrote this in a panic to make the page literally work at all so if you
  // want to e.g. listen for new contracts you may want to fix it up
  const [contracts, setContracts] = useState<Contract[] | undefined>()
  useEffect(() => {
    if (tag != null) {
      listTaggedContractsCaseInsensitive(tag).then(setContracts)
    }
  }, [tag])

  return (
    <Page>
      <Title text={`#${tag}`} />
      <SearchableGrid contracts={contracts} />
    </Page>
  )
}
