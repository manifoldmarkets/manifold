// Based on a list of CertTxns, return the current ownership of the cert

import { ArrowRightIcon } from '@heroicons/react/outline'
import { getCertOwnership, getDividendPayouts } from 'common/calculate/cert'
import {
  calculatePrice,
  calculatePriceAfterBuy,
  calculateShares,
} from 'common/calculate/uniswap2'
import { CertContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { CertTxn } from 'common/txn'
import { formatLargeNumber, formatMoney } from 'common/util/format'
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
import { AmountInput } from '../widgets/amount-input'
import { Table } from '../widgets/table'
import { Title } from '../widgets/title'

export function CertInfo(props: { contract: CertContract }) {
  const { contract } = props
  const txns = useCertTxns(props.contract.id)
  const ownership = getCertOwnership(txns)
  const { SHARE: share, M$: mana } = contract.pool

  return (
    <Col className="gap-1 md:gap-2">
      <div className="max-w-full px-2">
        <h2 className="mb-2 text-xl text-indigo-700">Pool</h2>
        {share} shares <br />
        {formatMoney(mana)}
        <h2 className="mt-4 mb-2 text-xl text-indigo-700">Positions</h2>
        <Table>
          <thead>
            <tr>
              <td>User</td>
              <td>Position</td>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ownership).map(([id, shares]) => (
              <tr key={id}>
                <td>{id}</td>
                <td> {shares}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
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

export function CertOverview(props: { contract: CertContract }) {
  const { contract } = props
  const [amount, setAmount] = useState<number | undefined>(10)
  const shares = calculateShares(contract.pool, amount ?? 0)
  const pricePerShare = (amount ?? 0) / shares

  function formatPrice(price: number) {
    return ENV_CONFIG.moneyMoniker + price.toFixed(2)
  }

  const price = formatPrice(calculatePrice(contract.pool))
  const after = formatPrice(calculatePriceAfterBuy(contract.pool, amount ?? 0))

  return (
    <Col className="gap-2 rounded-lg p-4">
      <div className="flex gap-2">
        <Image
          alt=""
          width={100}
          height={100}
          src={contract.coverImageUrl ?? ''}
          className="rounded-md"
        />
        <div className="flex grow justify-between gap-4">
          <Title className="!my-0">{contract.question}</Title>
          <span className="text-4xl">{price}</span>
        </div>
      </div>
      {/* TODO: tabs */}
      <Spacer h={8} />
      <Col className="flex-1 gap-2 rounded-md bg-gray-100 p-4">
        <Row>
          <div className="flex-1">
            <div className="text-xs text-gray-400">Shares</div>
            {formatLargeNumber(shares)}
          </div>
          <div className="flex-1">
            <div className="text-xs text-gray-400">Price</div>
            <div className="flex items-center gap-2">
              {price}
              {price !== after && (
                <>
                  <ArrowRightIcon className="h-4 w-4" /> {after}
                  <span className="whitespace-nowrap">
                    ({formatPrice(pricePerShare)} avg)
                  </span>
                </>
              )}
            </div>
          </div>
        </Row>
        <Row className="items-bottom justify-between">
          <div>
            <label className="text-xs text-gray-400">Amount</label>
            <AmountInput
              inputClassName="!w-32"
              label={ENV_CONFIG.moneyMoniker}
              amount={amount}
              onChange={setAmount}
            />
          </div>
          <Button
            onClick={async () =>
              await swapCert({ certId: contract.id, amount })
            }
          >
            Buy
          </Button>
        </Row>
      </Col>
    </Col>
  )
}

export function CertTrades(props: { contract: CertContract }) {
  const { contract } = props
  const txns = useCertTxns(contract.id)
  return (
    <>
      {txns.map((txn, i) => (
        <div key={i} className="rounded-lg px-2 py-1 text-gray-500">
          {txn.description} <RelativeTimestamp time={txn.createdTime} />
        </div>
      ))}
      <PayDividendWidget contract={contract} txns={txns} />
    </>
  )
}
