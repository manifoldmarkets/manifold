import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { PlusSmIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ContractSearch } from 'web/components/contract-search'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { ContractPageContent } from './[username]/[contractSlug]'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const auth = creds ? await getUserAndPrivateUser(creds.user.uid) : null
  return { props: { auth } }
}

const Home = (props: { auth: { user: User } | null }) => {
  const user = props.auth ? props.auth.user : null
  const [contract, setContract] = useContractPage()

  const router = useRouter()
  useTracking('view home')

  useSaveReferral()

  return (
    <>
      <Page suspend={!!contract}>
        <Col className="mx-auto w-full p-2">
          <ContractSearch
            user={user}
            useQuerySortLocalStorage={true}
            useQuerySortUrlParams={true}
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
          user={user}
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
      const args = [...(arguments as any)] as any
      // Discard NextJS router state.
      args[0] = null
      pushState.apply(history, args)
      updateContract()
    }

    window.history.replaceState = function () {
      // eslint-disable-next-line prefer-rest-params
      const args = [...(arguments as any)] as any
      // Discard NextJS router state.
      args[0] = null
      replaceState.apply(history, args)
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
