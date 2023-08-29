import { Page } from 'web/components/layout/page'
import { OmniSearch } from 'web/components/search/omni-search'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'

export default function Find() {
  const [query, setQuery] = usePersistentQueryState('q', '')

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
