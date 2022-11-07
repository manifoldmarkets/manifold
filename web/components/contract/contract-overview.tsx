import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ContractChart } from 'web/components/charts/contract'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../widgets/linkify'
import {
  BinaryResolutionOrChance,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from './contract-card'
import { Bet } from 'common/bet'
import BetButton, { BinaryMobileBetting } from '../bet/bet-button'
import {
  Contract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  BinaryContract,
  CertContract,
} from 'common/contract'
import { ContractDetails } from './contract-details'
import { ContractReportResolution } from './contract-report-resolution'
import { SizedContainer } from 'web/components/sized-container'
import { useCertTxns } from 'web/hooks/txns/use-cert-txns'
import { RelativeTimestamp } from '../relative-timestamp'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  calculatePrice,
  calculatePriceAfterBuy,
  calculateShares,
} from 'common/calculate/uniswap2'
import { formatMoney } from 'common/util/format'
import { Title } from '../widgets/title'
import { swapCert } from 'web/lib/firebase/api'

const OverviewQuestion = (props: { text: string }) => (
  <Linkify className="text-lg text-indigo-700 sm:text-2xl" text={props.text} />
)

const BetWidget = (props: { contract: CPMMContract }) => {
  const user = useUser()
  return (
    <Col>
      <BetButton contract={props.contract} />
      {!user && (
        <div className="mt-1 text-center text-sm text-gray-500">
          (with play money!)
        </div>
      )}
    </Col>
  )
}

const SizedContractChart = (props: {
  contract: Contract
  bets: Bet[]
  fullHeight: number
  mobileHeight: number
}) => {
  const { fullHeight, mobileHeight, contract, bets } = props
  return (
    <SizedContainer fullHeight={fullHeight} mobileHeight={mobileHeight}>
      {(width, height) => (
        <ContractChart
          width={width}
          height={height}
          contract={contract}
          bets={bets}
        />
      )}
    </SizedContainer>
  )
}

const NumericOverview = (props: { contract: NumericContract; bets: Bet[] }) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <NumericResolutionOrExpectation
            contract={contract}
            className="hidden items-end xl:flex"
          />
        </Row>
        <NumericResolutionOrExpectation
          className="items-center justify-between gap-4 xl:hidden"
          contract={contract}
        />
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
      />
    </Col>
  )
}

const BinaryOverview = (props: { contract: BinaryContract; bets: Bet[] }) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-1 px-2">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <Row>
            <BinaryResolutionOrChance
              className="flex items-end"
              contract={contract}
              large
            />
            {contract.isResolved && (
              <ContractReportResolution contract={contract} />
            )}
          </Row>
        </Row>
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
      />
      <Row className="items-center justify-between gap-4 xl:hidden">
        {tradingAllowed(contract) && (
          <BinaryMobileBetting contract={contract} />
        )}
      </Row>
    </Col>
  )
}

const ChoiceOverview = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  const { question, resolution } = contract
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <OverviewQuestion text={question} />
        {resolution && (
          <Row>
            <FreeResponseResolutionOrChance
              contract={contract}
              truncate="none"
            />
            <ContractReportResolution contract={contract} />
          </Row>
        )}
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={350}
        mobileHeight={250}
      />
    </Col>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <PseudoNumericResolutionOrExpectation
            contract={contract}
            className="hidden items-end xl:flex"
          />
        </Row>
        <Row className="items-center justify-between gap-4 xl:hidden">
          <PseudoNumericResolutionOrExpectation contract={contract} />
          {tradingAllowed(contract) && <BetWidget contract={contract} />}
        </Row>
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
      />
    </Col>
  )
}

function CertOverview(props: { contract: CertContract }) {
  const { contract } = props
  const txns = useCertTxns(contract.id)

  // Show one div for each of the txns time & descriptions
  return (
    <Col className="gap-1 md:gap-2">
      <BuyCertWidget contract={contract} />

      <Title>Overview</Title>
      <div className="rounded-lg bg-yellow-100 px-2 py-4 text-yellow-700">
        Pool: {JSON.stringify(contract.pool)}
      </div>
      {txns.map((txn, i) => (
        <div key={i} className="rounded-lg px-2 py-1 text-gray-500">
          {txn.description} <RelativeTimestamp time={txn.createdTime} />
        </div>
      ))}
    </Col>
  )
}

// A form and a button, to let the user input a certain amount of mana and display the amount of shares they will get
function BuyCertWidget(props: { contract: CertContract }) {
  const { contract } = props
  const [amount, setAmount] = useState(10)
  const shares = calculateShares(contract.pool, amount)
  const pricePerShare = amount / shares

  function formatPrice(price: number) {
    return ENV_CONFIG.moneyMoniker + price.toFixed(2)
  }

  return (
    // Make it look like a nice card
    <Col className="max-w-md gap-2 rounded-lg bg-gray-100 p-4">
      <Title>Buy "{contract.question}"</Title>
      <Row className="gap-2">
        <Col>
          <label htmlFor="amount">{ENV_CONFIG.moneyMoniker} Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value))}
          />
        </Col>
        <Col>
          <label htmlFor="shares">Shares purchased</label>
          <input
            className="border-none bg-gray-100"
            type="number"
            value={shares}
            readOnly
          />
        </Col>
      </Row>
      <Row>
        <br /> Average price per share: {formatPrice(pricePerShare)}
        <br /> Cert price: {formatPrice(calculatePrice(contract.pool))} {' => '}
        {formatPrice(calculatePriceAfterBuy(contract.pool, amount))}
      </Row>
      <Button
        onClick={async () => {
          console.log('buying', amount, 'shares')
          await swapCert({
            certId: contract.id,
            amount,
          })
        }}
      >
        Buy
      </Button>
    </Col>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  switch (contract.outcomeType) {
    case 'BINARY':
      return <BinaryOverview contract={contract} bets={bets} />
    case 'NUMERIC':
      return <NumericOverview contract={contract} bets={bets} />
    case 'PSEUDO_NUMERIC':
      return <PseudoNumericOverview contract={contract} bets={bets} />
    case 'CERT':
      return <CertOverview contract={contract} />
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceOverview contract={contract} bets={bets} />
  }
}
