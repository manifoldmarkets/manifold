import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

const App = () => {
  return (
    <Page>
      <SEO
        title="COWP"
        description="A picture of a cowpy cowp copwer cowp saying 'salutations'"
        url="/cowp"
      />
      <Link href="https://www.youtube.com/watch?v=FavUpD_IjVY">
        <img
          src="https://i.imgur.com/Lt54IiU.png"
          className="cursor-pointer"
          alt="A hat-wearing cow with big glassy eyes that stare into your soul. Beside her floats the letters COOW plus P."
        />
      </Link>
    </Page>
  )
}

export default App
