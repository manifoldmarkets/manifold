// Based on a list of CertTxns, return the current ownership of the cert

import {
  calculatePrice,
  calculatePriceAfterBuy,
  calculateShares,
} from 'common/calculate/uniswap2'
import { CertContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { CertTxn } from 'common/txn'
import { sortBy } from 'lodash'
import Image from 'next/image'
import { useState } from 'react'
import { useCertTxns } from 'web/hooks/txns/use-cert-txns'
import { swapCert } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { Title } from '../widgets/title'

// e.g. { 'user/jasldfjdkl': 900, 'contract/afsdjkla': 100 }
function getCertOwnership(txns: CertTxn[]) {
  const ownership: { [id: string]: number } = {}
  const sortedTxns = sortBy(txns, 'createdTime')
  for (const txn of sortedTxns) {
    const fromId = `${txn.fromType}/${txn.fromId}`
    const toId = `${txn.toType}/${txn.toId}`
    if (txn.category === 'CERT_MINT') {
      ownership[toId] = txn.amount
    } else if (txn.category === 'CERT_TRANSFER') {
      ownership[fromId] -= txn.amount
      ownership[toId] = (ownership[toId] || 0) + txn.amount
    }
  }
  return ownership
}

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
    <Row className="flex-1 justify-between gap-2 rounded-lg bg-gray-100 p-4">
      <Col>
        <Title>Buy "{contract.question}"</Title>

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
        <Row>
          <br /> Average price per share: {formatPrice(pricePerShare)}
          <br /> Cert price: {formatPrice(calculatePrice(contract.pool))}{' '}
          {' => '}
          {formatPrice(calculatePriceAfterBuy(contract.pool, amount))}
        </Row>
      </Col>
      <Image
        alt=""
        width={300}
        height={300}
        src={
          contract.coverImageUrl ??
          `https://picsum.photos/seed/${contract.id}/300/300`
        }
      />
    </Row>
  )
}
