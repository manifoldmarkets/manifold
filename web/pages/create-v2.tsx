'use client'
import { Page } from 'web/components/layout/page'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'
import { NewContractPanelV2 } from 'web/components/new-contract/new-contract-panel-v2'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'
import { useEffect, useState } from 'react'

export default function CreateV2() {
  useRedirectIfSignedOut()

  const user = useUser()
  const { searchParams } = useDefinedSearchParams()
  const paramsEntries = Object.fromEntries(searchParams.entries())

  function getURLParams() {
    try {
      return searchParams
        ? (Object.fromEntries(
            Object.keys(paramsEntries).map((key) => [
              key,
              JSON.parse(paramsEntries[key] || 'null'),
            ])
          ).params as NewQuestionParams)
        : ({} as NewQuestionParams)
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
      <Page trackPageView={'banned from create page v2'}>
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-lg px-6 py-4 sm:py-0">
            <Title>Create a question</Title>
            <p>Sorry, you are currently banned from creating a question.</p>
          </div>
        </div>
      </Page>
    )

  return (
    <Page trackPageView={'create page v2'}>
      <NewContractPanelV2 params={params} creator={user} />
    </Page>
  )
}
