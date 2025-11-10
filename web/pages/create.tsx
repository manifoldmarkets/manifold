'use client'
import { useEffect, useState } from 'react'
import { Page } from 'web/components/layout/page'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract/new-contract-panel'
import { Title } from 'web/components/widgets/title'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'

export default function Create() {
  useRedirectIfSignedOut()

  const user = useUser()
  const { searchParams } = useDefinedSearchParams()

  function getURLParams() {
    try {
      if (!searchParams) return {} as NewQuestionParams

      // If there's a 'params' query parameter, it contains JSON-encoded question params
      const paramsString = searchParams.get('params')
      if (paramsString) {
        return JSON.parse(paramsString) as NewQuestionParams
      }

      // Otherwise return empty params (the 'type' parameter is handled separately in NewContractPanel)
      return {} as NewQuestionParams
    } catch (error) {
      console.error('Error parsing URL params:', error)
      return {} as NewQuestionParams
    }
  }

  const [params, setParams] = useState(getURLParams())

  useEffect(() => {
    const params = getURLParams()
    if (!params || Object.keys(params).length === 0) return
    setParams(params)
  }, [searchParams])

  if (!user) return <div />

  if (user.isBannedFromPosting)
    return (
      <Page trackPageView={'banned from create page'}>
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-lg px-6 py-4 sm:py-0">
            <Title>Create a question</Title>
            <p>Sorry, you are currently banned from creating a question.</p>
          </div>
        </div>
      </Page>
    )

  return (
    <Page trackPageView={'create page'}>
      <NewContractPanel params={params} creator={user} />
    </Page>
  )
}
