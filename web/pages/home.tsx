import { useRouter } from 'next/router'
import { PencilAltIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrefetch } from 'web/hooks/use-prefetch'

const Home = () => {
  const user = useUser()
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
            headerClassName="sticky"
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
