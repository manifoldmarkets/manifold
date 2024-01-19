'use client'
import { getIsNative } from 'web/lib/native/is-native'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract-college/new-contract-panel'
import { db } from 'web/lib/supabase/db'
import { Group } from 'common/group'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import Welcome from 'web/components/onboarding-college/welcome-college'
import { getGroupBySlug } from 'web/lib/supabase/groups'
import { useEffect, useState, memo } from 'react'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
export const getStaticProps = async () => {
  const { data } = await db
    .from('contracts')
    .select('data')
    .contains('group_slugs', ['college-chance-me'])
    .neq('outcome_type', 'STONK')
    .limit(50)
  const contracts = (data ?? []).map((d) => d.data) as Contract[]
  contracts.sort((a, b) => b.uniqueBettorCount - a.uniqueBettorCount)
  const trendingContracts = contracts.slice(0, 2)
  return {
    props: { trendingContracts },
  }
}
export const useRedirectIfSignedOutCollege = () => {
  const user = useUser()
  const router = useRouter()
  useEffect(() => {
    if (user !== null) return
    // Go to landing page if not logged in.
    if (getIsNative()) router.replace('/sign-in-waiting')
    else router.replace('/college')
  }, [user])
}

export default function Chanceme(props: {
  trendingContracts: CPMMBinaryContract[]
}) {
  const { trendingContracts } = props
  useRedirectIfSignedOutCollege()
  const [group, setGroup] = useState<Group | null>(null)
  const user = useUser()

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const fetchedGroup = await getGroupBySlug('college-chance-me')
        setGroup(fetchedGroup)
      } catch (error) {
        console.error('Error fetching group:', error)
        // Handle the error appropriately
      }
    }

    if (user) {
      fetchGroup()
    }
  }, [user])
  if (!user) return <div></div>
  if (!user || !group) {
    return <div></div>
  }
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
  const json =
    '{ "type": "doc", "content": [{ "type": "paragraph", "content": [ { "type": "text", "text": "All questions are optional, feel free to put as much information as you are comfortable with" } ] },{ "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Intended Major" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "What field do you hope to major in?" } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Standardized Testing" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Enter your standardized testing results here, if you took any." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "UW/W GPA" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Enter your unweighted and weighted GPA here." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "APs, Honors, and College Level Classes" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Provide information about your coursework here." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Demographics" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Provide your demographic information here." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Extracurricular Information" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Describe your extracurricular activities here." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Awards" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "List any awards you have received." } ] }, { "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Any Other Information" } ] }, { "type": "paragraph", "content": [ { "type": "text", "text": "Include any other relevant information here." } ] },{ "type": "heading", "attrs": { "level": 3 }, "content": [ { "type": "text", "text": "Resolution criteria: This market will resolve YES for the colleges that the creator gets into, NO for the ones that the creator is rejected from, and N/A for the colleges that the creator does not apply to. Resolves to % if the creator does not resolve it within one month of the close date and appears to be inactive" } ] } ] }'
  return (
    <>
      <Welcome />
      <Page trackPageView={'create page'}>
        <br></br>
        <br></br>
        <div className="text-primary-700 mb-2 mt-3 text-center text-2xl font-normal">
          Create your own market
        </div>
        <NewContractPanel
          params={
            {
              q: '',
              description: json,
              groupIds: [group.id],
              addAnswersMode: 'ONLY_CREATOR',
              shouldAnswersSumToOne: false,
            } as NewQuestionParams
          }
          creator={user}
        />
        <br></br>
        <div
          className="text-primary-700 mb-2 text-2xl font-semibold"
          style={{ textAlign: 'center' }}
        >
          OR
        </div>
        <div className="text-primary-700 mb-2 mt-3 text-center text-2xl font-normal">
          Bet on a market
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ContractsSection
            contracts={trendingContracts}
            className="w-full self-center"
          />
        </div>
      </Page>
    </>
  )
}

const ContractsSection = memo(function ContractsSection(props: {
  contracts: Contract[]
  className?: string
}) {
  const { contracts, className } = props
  return (
    <Col className={clsx('max-w-2xl gap-4', className)}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
})
