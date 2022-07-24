import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { PlusSmIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { getSavedSort } from 'web/hooks/use-sort-and-query-params'
import { ContractSearch, DEFAULT_SORT } from 'web/components/contract-search'
import { Contract } from 'common/contract'
import { ContractPageContent } from './[username]/[contractSlug]'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'

export const getServerSideProps = redirectIfLoggedOut('/')

const Home = () => {
  const [contract, setContract] = useContractPage()

  const router = useRouter()
  useTracking('view home')

  useSaveReferral()

  return (
    <>
      <Page suspend={!!contract}>
        <Col className="mx-auto w-full p-2">
          <ContractSearch
            querySortOptions={{
              shouldLoadFromStorage: true,
              defaultSort: getSavedSort() ?? DEFAULT_SORT,
            }}
            onContractClick={(c) => {
              // Show contract without navigating to contract page.
              setContract(c)
              // Update the url without switching pages in Nextjs.
              history.pushState(null, '', `/${c.creatorUsername}/${c.slug}`)
            }}
          />
        </Col>
        <button
          type="button"
          className="fixed bottom-[70px] right-3 inline-flex items-center rounded-full border border-transparent bg-indigo-600 p-3 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:hidden"
          onClick={() => {
            router.push('/create')
            track('mobile create button')
          }}
        >
          <PlusSmIcon className="h-8 w-8" aria-hidden="true" />
        </button>
      </Page>

      {contract && (
        <ContractPageContent
          contract={contract}
          username={contract.creatorUsername}
          slug={contract.slug}
          bets={[]}
          comments={[]}
          backToHome={() => {
            history.back()
          }}
        />
      )}
    </>
  )
}

const useContractPage = () => {
  const [contract, setContract] = useState<Contract | undefined>()

  useEffect(() => {
    const updateContract = () => {
      const path = location.pathname.split('/').slice(1)
      if (path[0] === 'home') setContract(undefined)
      else {
        const [username, contractSlug] = path
        if (!username || !contractSlug) setContract(undefined)
        else {
          // Show contract if route is to a contract: '/[username]/[contractSlug]'.
          getContractFromSlug(contractSlug).then(setContract)
        }
      }
    }

    const { pushState, replaceState } = window.history

    window.history.pushState = function () {
      // eslint-disable-next-line prefer-rest-params
      pushState.apply(history, arguments as any)
      updateContract()
    }

    window.history.replaceState = function () {
      // eslint-disable-next-line prefer-rest-params
      replaceState.apply(history, arguments as any)
      updateContract()
    }

    return () => {
      window.history.pushState = pushState
      window.history.replaceState = replaceState
    }
  }, [])

  useEffect(() => {
    if (contract) window.scrollTo(0, 0)
  }, [contract])

  return [contract, setContract] as const
}

export default Home
