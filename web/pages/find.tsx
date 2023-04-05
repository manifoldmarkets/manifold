import { useRouter } from 'next/router'
import { Page } from 'web/components/layout/page'
import { OmniSearch } from 'web/components/search/omni-search'
import {
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'

export default function Find() {
  const router = useRouter()
  const store = urlParamStore(router)
  const startingQuery = typeof router.query.q === 'string' ? router.query.q : ''
  const [query, setQuery] = usePersistentState(startingQuery ?? '', {
    store,
    key: 'q',
  })

  return (
    <Page>
      <OmniSearch
        inputClassName="sticky top-0 left-0 right-0 !rounded-full !border !border-ink-400"
        query={query}
        setQuery={setQuery}
      />
    </Page>
  )
}
