import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'

const App = () => {
  return (
    <Page trackPageView={'tv page'}>
      <Title>Manifold TV: Coming Soon</Title>
      <div>
        First event: Biden's State of the Union address watch party (March 7th
        at 6 pm PT / 9 pm ET)
      </div>
    </Page>
  )
}

export default App
