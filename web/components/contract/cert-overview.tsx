// Based on a list of CertTxns, return the current ownership of the cert

import { getCertOwnership, getDividendPayouts } from 'common/calculate/cert'
import {
  calculatePrice,
  calculatePriceAfterBuy,
  calculateShares,
} from 'common/calculate/uniswap2'
import { CertContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { CertTxn } from 'common/txn'
import Image from 'next/image'
import { useState } from 'react'
import { useCertTxns } from 'web/hooks/txns/use-cert-txns'
import { useUser } from 'web/hooks/use-user'
import { dividendCert, swapCert } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { RelativeTimestamp } from '../relative-timestamp'
import { Title } from '../widgets/title'

export function CertOverview(props: { contract: CertContract }) {
  const { contract } = props
  const txns = useCertTxns(contract.id)
  const ownership = getCertOwnership(txns)

  // Show one div for each of the txns time & descriptions
  return (
    <Col className="gap-1 md:gap-2">
      <BuyCertWidget contract={contract} />

      <Title>Overview</Title>
      <div className="rounded-lg bg-yellow-100 px-2 py-4 text-yellow-700">
        Pool: {JSON.stringify(contract.pool)}
        {Object.entries(ownership).map(([id, shares]) => (
          <p key={id}>
            - {id}: {shares}
          </p>
        ))}
      </div>
      {txns.map((txn, i) => (
        <div key={i} className="rounded-lg px-2 py-1 text-gray-500">
          {txn.description} <RelativeTimestamp time={txn.createdTime} />
        </div>
      ))}

      <PayDividendWidget contract={contract} txns={txns} />
    </Col>
  )
}

function PayDividendWidget(props: { contract: CertContract; txns: CertTxn[] }) {
  const { contract, txns } = props
  const user = useUser()
  const [totalDividend, setTotalDividend] = useState(10_000)
  if (!user || user.id != contract.creatorId) return null
  const payouts = getDividendPayouts(user?.id, totalDividend, txns)
  return (
    <Col className="gap-2 rounded-lg bg-gray-50 p-4">
      <Title>Pay Dividend</Title>
      <input
        type="number"
        value={totalDividend}
        onChange={(e) => setTotalDividend(parseInt(e.target.value))}
      />
      <p>{JSON.stringify(payouts)}</p>
      <Button
        color="gradient"
        onClick={async () => {
          await dividendCert({
            certId: contract.id,
            amount: totalDividend,
          })
        }}
      >
        Pay Dividend
      </Button>
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
    <Col className="gap-2 rounded-lg bg-gray-100 p-4">
      <Title>Buy "{contract.question}"</Title>
      <Row className="justify-between gap-4">
        <Col className="flex-1">
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
          <Spacer h={8} />
          <Button
            onClick={async () => {
              await swapCert({
                certId: contract.id,
                amount,
              })
            }}
          >
            Buy
          </Button>
          <Row>
            <br /> Average price per share: {formatPrice(pricePerShare)}
            <br /> Cert price: {formatPrice(calculatePrice(contract.pool))}{' '}
            {' => '}
            {formatPrice(calculatePriceAfterBuy(contract.pool, amount))}
          </Row>
        </Col>
        {contract.coverImageUrl && (
          <Image alt="" width={300} height={300} src={contract.coverImageUrl} />
        )}
      </Row>
    </Col>
  )
}
