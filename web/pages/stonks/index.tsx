import { Page } from 'web/components/layout/page'
import { StonksSearch } from 'web/components/stonks/stonks-search'
import { StonksList } from 'web/components/stonks/StonksList'

export default function Stonks() {
  return (
    <Page trackPageView="stonks">
      <StonksList />
      {/* <StonksSearch
        persistPrefix="stonks"
        defaultContractType="STONK"
        defaultSearchType="Questions"
        defaultForYou="0"
      /> */}
    </Page>
  )
}
