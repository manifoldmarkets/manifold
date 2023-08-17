import React, { useEffect, useState } from 'react'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { getSavedSort } from 'web/hooks/use-sort-and-query-params'
import { ContractSearch, DEFAULT_SORT } from 'web/components/contract-search'
import { Contract } from 'common/contract'
import { ContractPageContent } from './[username]/[contractSlug]'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { useTracking } from 'web/hooks/use-tracking'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Button } from 'web/components/button'
import { SiteLink } from 'web/components/site-link'

export const getServerSideProps = redirectIfLoggedOut('/')

const Home = () => {
  const [contract, setContract] = useContractPage()

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
          getContractFromSlug(contractSlug).then((contract) => {
            const path = location.pathname.split('/').slice(1)
            const [_username, contractSlug] = path
            // Make sure we're still on the same contract.
            if (contract?.slug === contractSlug) setContract(contract)
          })
        }
      }
    }

    addEventListener('popstate', updateContract)

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
      removeEventListener('popstate', updateContract)
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
