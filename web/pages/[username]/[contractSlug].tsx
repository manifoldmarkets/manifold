import { Bet, LimitBet } from 'common/bet'
import {
  Contract,
  ContractParams,
  MaybeAuthedContractParams,
} from 'common/contract'
import { getContractParams } from 'common/contract-params'
import { base64toPoints } from 'common/edge/og'
import { CASH_SUFFIX } from 'common/envs/constants'
import { getContract, getContractFromSlug } from 'common/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { pick, sortBy, uniqBy } from 'lodash'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { YourOrders } from 'web/components/bet/order-book'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { TwombaContractPageContent } from 'web/components/contract/twomba-contract-page'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useBetsOnce, useUnfilledBets } from 'web/hooks/use-bets'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useUser } from 'web/hooks/use-user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from '../404'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { useSweepstakes } from 'web/components/sweepstakes-provider'

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()
  const contract = await getContractFromSlug(adminDb, contractSlug)

  if (!contract) {
    return {
      notFound: true,
    }
  }

  if (contract.deleted) {
    return {
      props: {
        state: 'deleted',
        slug: contract.slug,
        visibility: contract.visibility,
      },
    }
  }

  if (contract.token === 'CASH') {
    const manaContract = contract.siblingContractId
      ? await getContract(adminDb, contract.siblingContractId)
      : null
    const slug = manaContract?.slug ?? contractSlug.replace(CASH_SUFFIX, '')

    return {
      redirect: {
        destination: `/${username}/${slug}?play=false`,
        permanent: false,
      },
    }
  }

  const props = await getContractParams(contract, adminDb)

  // Fetch sibling contract if it exists
  let cash = undefined
  if (contract.siblingContractId) {
    const cashContract = await getContract(adminDb, contract.siblingContractId)
    if (cashContract) {
      const params = await getContractParams(cashContract, adminDb)
      cash = pick(params, [
        'contract',
        'lastBetTime',
        'pointsString',
        'multiPointsString',
        'userPositionsByOutcome',
        'totalPositions',
        'totalBets',
      ])
    }
  }
  return {
    props: {
      state: 'authed',
      params: removeUndefinedProps({ ...props, cash }),
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: MaybeAuthedContractParams) {
  if (props.state === 'deleted') {
    return (
      <Page trackPageView={false}>
        <div className="flex h-[50vh] flex-col items-center justify-center">
          <Title>Question deleted</Title>
        </div>
      </Page>
    )
  }

  return <NonPrivateContractPage contractParams={props.params} />
}

function NonPrivateContractPage(props: { contractParams: ContractParams }) {
  const { contract, pointsString, cash } = props.contractParams
  const { prefersPlay } = useSweepstakes()

  const points = pointsString ? base64toPoints(pointsString) : []
  const cashPoints = cash
    ? cash.pointsString
      ? base64toPoints(cash.pointsString)
      : []
    : null

  const inIframe = useIsIframe()
  if (!contract) {
    return <Custom404 customText="Unable to fetch question" />
  }
  if (inIframe) {
    return (
      <ContractEmbedPage
        contract={contract}
        points={points}
        cashContract={cash ? cash.contract : null}
        cashPoints={cashPoints}
      />
    )
  }

  return (
    <Page trackPageView={false} className="xl:col-span-10">
      <ContractSEO
        contract={!prefersPlay && cash?.contract ? cash.contract : contract}
        points={pointsString}
      />
      <TwombaContractPageContent key={contract.id} {...props.contractParams} />
    </Page>
  )
}

export function YourTrades(props: { contract: Contract; yourNewBets: Bet[] }) {
  const { contract, yourNewBets } = props
  const user = useUser()

  const staticBets = useBetsOnce({
    contractId: contract.id,
    userId: !user ? 'loading' : user.id,
    order: 'asc',
  })

  const userBets = sortBy(
    uniqBy([...yourNewBets, ...(staticBets ?? [])], 'id'),
    'createdTime'
  )
  const visibleUserBets = userBets.filter(
    (bet) => !bet.isRedemption && bet.amount !== 0
  )

  const allLimitBets =
    contract.mechanism === 'cpmm-1'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useUnfilledBets(contract.id, { enabled: true }) ?? []
      : []
  const userLimitBets = allLimitBets.filter(
    (bet) => bet.userId === user?.id
  ) as LimitBet[]

  if (
    (userLimitBets.length === 0 || contract.mechanism != 'cpmm-1') &&
    visibleUserBets.length === 0
  ) {
    return null
  }

  return (
    <Col className="bg-canvas-50 rounded px-3 py-4 pb-0">
      {contract.mechanism === 'cpmm-1' && (
        <YourOrders
          contract={contract}
          bets={userLimitBets}
          deemphasizedHeader
        />
      )}

      {visibleUserBets.length > 0 && (
        <>
          <div className="pl-2 font-semibold">Your trades</div>
          <ContractBetsTable
            contract={contract}
            bets={userBets}
            isYourBets
            paginate
          />
        </>
      )}
    </Col>
  )
}
