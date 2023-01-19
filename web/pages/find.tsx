import { Page } from 'web/components/layout/page'
import { OmniSearch } from 'web/components/search/omni-search'

export default function Find() {
  return (
    <Page>
      <OmniSearch inputClassName="sticky top-0 left-0 right-0" />
    </Page>
  )
}
