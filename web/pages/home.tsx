import { useRouter } from 'next/router'
import { PencilAltIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { User } from 'common/user'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { GetServerSideProps } from 'next'
import { usePrefetch } from 'web/hooks/use-prefetch'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.uid) : null
  return { props: { auth } }
}

const Home = (props: { auth: { user: User } | null }) => {
  const user = props.auth ? props.auth.user : null
  const router = useRouter()
  useTracking('view home')

  useSaveReferral()
  usePrefetch(user?.id)

  return (
    <>
      <Page>
        <Col className="mx-auto w-full p-2">
          <ContractSearch
            user={user}
            persistPrefix="home-search"
            useQueryUrlParam={true}
          />
        </Col>
        <button
          type="button"
          className="fixed bottom-[70px] right-3 z-20 inline-flex items-center rounded-full border border-transparent bg-indigo-600 p-4 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden"
          onClick={() => {
            router.push('/create')
            track('mobile create button')
          }}
        >
          <PencilAltIcon className="h-7 w-7" aria-hidden="true" />
        </button>
      </Page>
    </>
  )
}

export default Home
