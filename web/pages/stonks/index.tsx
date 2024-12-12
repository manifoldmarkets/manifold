import { Page } from 'web/components/layout/page'
import { StonksList } from 'web/components/stonks/StonksList'

export default function Stonks() {
  return (
    <Page trackPageView="stonks">
      <StonksList />
    </Page>
  )
}
