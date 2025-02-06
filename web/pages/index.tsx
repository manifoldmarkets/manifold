import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import BrowsePage from './browse'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  return {
    props: {},
  }
})

export default function Index() {
  return <BrowsePage />
}
