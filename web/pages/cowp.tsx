import Link from 'next/link'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'

const App = () => {
  return (
    <Page className="">
      <SEO
        title="COWP"
        description="A picture of a cowpy cowp copwer cowp saying 'salutations'"
        url="/cowp"
      />
      <Link href="https://en.wikipedia.org/wiki/Earl_Cowper">
        <img src="https://i.imgur.com/Lt54IiU.png" />
      </Link>
    </Page>
  )
}

export default App
