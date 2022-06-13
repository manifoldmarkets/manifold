import React, { useEffect, useState } from 'react'
import Router, { useRouter } from 'next/router'
import { PlusSmIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { ContractSearch } from 'web/components/contract-search'
import { Contract } from 'common/contract'
import { ContractPageContent } from './[username]/[contractSlug]'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { useContractWithPreload } from 'web/hooks/use-contract'

const Home = () => {
  const user = useUser()
  const [contract, setContract] = useContractPage()

  const router = useRouter()

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <>
      <Page assertUser="signed-in" suspend={!!contract}>
        <Col className="mx-auto w-full p-2">
          <ContractSearch
            querySortOptions={{
              shouldLoadFromStorage: true,
              defaultSort: '24-hour-vol',
            }}
            showCategorySelector
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
          onClick={() => router.push('/create')}
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
    const onBack = () => {
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
    window.addEventListener('popstate', onBack)

    // Hack. Listen to changes in href to clear contract on navigate home.
    let href = document.location.href
    const observer = new MutationObserver(function (_mutations) {
      if (href != document.location.href) {
        href = document.location.href

        const path = location.pathname.split('/').slice(1)
        if (path[0] === 'home') setContract(undefined)
      }
    })
    observer.observe(document, { subtree: true, childList: true })

    return () => {
      window.removeEventListener('popstate', onBack)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (contract) window.scrollTo(0, 0)
  }, [contract])

  const updatedContract = useContractWithPreload(contract)

  return [updatedContract, setContract] as const
}

export default Home
