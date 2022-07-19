import Router from 'next/router'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

export const getServerSideProps = redirectIfLoggedOut('/')

// Deprecated: redirects to /portfolio.
// Eventually, this will be removed.
export default function TradesPage() {
  Router.replace('/portfolio')
}
