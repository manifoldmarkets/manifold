import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getUser, User } from 'web/lib/firebase/users'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { SEO } from 'web/components/SEO'
import { EditInPlaceInput } from 'web/components/widgets/edit-in-place'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { getPortfolioBySlug } from 'web/lib/supabase/portfolio'
import { Portfolio, portfolioPath } from 'common/portfolio'
import { buyPortfolio, updatePortfolio } from 'web/lib/firebase/api'
import { getContracts } from 'web/lib/supabase/contracts'
import { Contract } from 'common/contract'
import { keyBy, mapValues, partition } from 'lodash'
import { ContractCard } from 'web/components/contract/contract-card'
import { Col } from 'web/components/layout/col'
import { BinaryOutcomeLabel } from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { AmountInput } from 'web/components/widgets/amount-input'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import toast from 'react-hot-toast'

export async function getStaticProps(props: {
  params: { portfolioSlug: string }
}) {
  const { portfolioSlug } = props.params

  const portfolio = await getPortfolioBySlug(portfolioSlug)
  const creator = portfolio ? await getUser(portfolio.creatorId) : null

  const contractIds = portfolio?.items.map((item) => item.contractId) ?? []
  const contracts = await getContracts(contractIds)

  return {
    props: {
      portfolio,
      creator,
      contracts,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PortfolioPage(props: {
  portfolio: Portfolio | null
  creator: User
  contracts: Contract[]
}) {
  const { creator, portfolio, contracts } = props
  const user = useUser()

  if (!portfolio) {
    return <Custom404 />
  }

  const itemsByContractId = keyBy(portfolio.items, 'contractId')
  const positions = mapValues(itemsByContractId, (item) => item.position)

  const path = portfolioPath(portfolio.slug)
  const shareUrl = `https://${ENV_CONFIG.domain}${path}`

  const canEdit = !!user && user.id === portfolio.creatorId

  return (
    <Page className="!max-w-[1720px]" mainClassName="!col-span-10">
      <SEO
        title={portfolio.name}
        description={'A portfolio of markets related to ' + portfolio.name}
        url={path}
      />
      <Col className="w-full gap-4 px-4 pt-4 sm:mx-auto lg:pt-0">
        <EditInPlaceInput
          className="px-2 !text-3xl sm:px-0"
          initialValue={portfolio.name}
          onSave={(name) => updatePortfolio({ id: portfolio.id, name })}
          disabled={!canEdit}
        >
          {(value) => <Title className="!mb-0">{value}</Title>}
        </EditInPlaceInput>

        <Row className="items-center gap-2">
          <Avatar
            size={'xs'}
            avatarUrl={creator.avatarUrl}
            username={creator.username}
          />
          <UserLink
            className="text-ink-700"
            name={creator.name}
            username={creator.username}
          />
          <CopyLinkButton
            linkIconOnlyProps={{
              tooltip: 'Copy link to portfolio',
            }}
            url={shareUrl}
            eventTrackingName={'copy portfolio link'}
          />
        </Row>

        <PurchaseWidget portfolio={portfolio} />

        <PortfolioView contracts={contracts} positions={positions} />
      </Col>
    </Page>
  )
}

const PurchaseWidget = (props: { portfolio: Portfolio }) => {
  const { portfolio } = props
  const [amount, setAmount] = useState<number>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [boughtAnti, setBoughtAnti] = useState(false)

  const onBuy = async (opposite?: boolean) => {
    if (amount) {
      setIsSubmitting(true)
      setBoughtAnti(!!opposite)
      const result = await buyPortfolio({
        portfolioId: portfolio.id,
        amount,
        buyOpposite: !!opposite,
      }).finally(() => setIsSubmitting(false))
      if (result.status === 'success') {
        toast.success(
          opposite ? 'Anti-portfolio purchased!' : 'Portfolio purchased!'
        )
      }
    }
  }

  return (
    <Col className="gap-4 self-start border p-4">
      <div>Purchase portfolio of markets, evenly</div>
      <Row className="gap-2">
        <AmountInput
          amount={amount}
          onChangeAmount={setAmount}
          label={ENV_CONFIG.moneyMoniker}
          inputClassName="w-36"
        />
        <Button
          onClick={() => onBuy()}
          disabled={isSubmitting}
          loading={!boughtAnti && isSubmitting}
          size="sm"
          color="green"
        >
          Buy portfolio
        </Button>
        <Button
          onClick={() => onBuy(true)}
          disabled={isSubmitting}
          loading={boughtAnti && isSubmitting}
          size="sm"
          color="red"
        >
          Buy anti-portfolio
        </Button>
      </Row>
    </Col>
  )
}

const PortfolioView = (props: {
  contracts: Contract[]
  positions: { [contractId: string]: 'YES' | 'NO' }
}) => {
  const { contracts, positions } = props
  const [yesContracts, noContracts] = partition(
    contracts,
    (contract) => positions[contract.id] === 'YES'
  )

  return (
    <Col className="gap-6">
      {yesContracts.length > 0 && (
        <Col className="gap-4">
          <div className="text-ink-800 text-2xl">
            Buy <BinaryOutcomeLabel outcome={'YES'} /> in
          </div>
          <Row className="flex-wrap gap-2">
            {yesContracts.map((contract) => (
              <Col>
                <ContractCard
                  className="max-w-[350px]"
                  contract={contract}
                  hideGroupLink
                  hideQuickBet
                />
              </Col>
            ))}
          </Row>
        </Col>
      )}
      {noContracts.length > 0 && (
        <Col className="gap-4">
          <div className="text-ink-800 text-2xl">
            Buy <BinaryOutcomeLabel outcome={'NO'} /> in
          </div>
          <Row className="flex-wrap gap-2">
            {noContracts.map((contract) => (
              <Col>
                <ContractCard
                  className="max-w-[350px]"
                  contract={contract}
                  hideGroupLink
                  hideQuickBet
                />
              </Col>
            ))}
          </Row>
        </Col>
      )}
    </Col>
  )
}
