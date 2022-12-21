// Based on a list of CertTxns, return the current ownership of the cert

import { RadioGroup } from '@headlessui/react'
import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import {
  getCertOwnershipUsers,
  getDividendPayouts,
} from 'common/calculate/cert'
import {
  calculatePrice,
  calculatePriceAfterBuy,
  calculateShares,
} from 'common/calculate/uniswap2'
import { CertContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { CertTxn } from 'common/txn'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { keyBy } from 'lodash'
import Image from 'next/image'
import { Fragment, useState } from 'react'
import { useCertTxns } from 'web/hooks/txns/use-cert-txns'
import { useUser, useUsersById } from 'web/hooks/use-user'
import { dividendCert, swapCert } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { AmountInput } from '../widgets/amount-input'
import { Avatar } from '../widgets/avatar'
import { Table } from '../widgets/table'
import { Title } from '../widgets/title'

export function CertInfo(props: { contract: CertContract }) {
  const { contract } = props
  const txns = useCertTxns(props.contract.id)
  const ownership = getCertOwnershipUsers(contract.creatorId, txns)
  const { SHARE: share, M$: mana } = contract.pool

  const userArr = useUsersById(Object.keys(ownership))
  const users = userArr ? keyBy(userArr, 'id') : {}

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
              <td>Shares</td>
            </tr>
          </thead>
          <tbody className="align-center">
            {Object.entries(ownership).map(([id, shares]) => {
              const user = users[id] ?? {
                username: '',
                id,
                name: 'Loading',
                avatarUrl: undefined,
              }

              return (
                <tr key={id}>
                  <td>
                    <div className="flex items-center gap-4">
                      <Avatar
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        size="sm"
                      />
                      {user.name}
                    </div>
                  </td>
                  <td>{shares}</td>
                </tr>
              )
            })}
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

function formatPrice(price: number) {
  return ENV_CONFIG.moneyMoniker + price.toFixed(2)
}

export function CertOverview(props: { contract: CertContract }) {
  const { contract } = props
  const [amount, setAmount] = useState<number | undefined>(10)

  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY')
  const isBuy = tradeType === 'BUY'

  const realAmount = (isBuy ? 1 : -1) * (amount ?? 0)

  const shares = calculateShares(contract.pool, realAmount)

  const price = formatPrice(calculatePrice(contract.pool))
  const after = formatPrice(calculatePriceAfterBuy(contract.pool, realAmount))

  const pricePerShare = formatPrice(realAmount / shares)

  return (
    <Col>
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

      <RadioGroup
        value={tradeType}
        onChange={setTradeType}
        className="relative top-[2px] mt-8 columns-2 text-center"
      >
        <RadioGroup.Label className="sr-only">Type</RadioGroup.Label>
        <RadioGroup.Option
          value="BUY"
          as={Fragment}
          // className="cursor-pointer bg-teal-100 checked:bg-teal-300"
        >
          {({ checked }) => (
            <div
              className={clsx(
                'rounded-t-lg border-2 bg-teal-100 py-2',
                checked
                  ? 'border-teal-300 border-b-teal-100'
                  : 'border-b-scarlet-300 border-teal-100'
              )}
            >
              Buy
            </div>
          )}
        </RadioGroup.Option>
        <RadioGroup.Option value="SELL" as={Fragment}>
          {({ checked }) => (
            <div
              className={clsx(
                'bg-scarlet-100 rounded-t-lg border-2 py-2',
                checked
                  ? 'border-scarlet-300 border-b-scarlet-100'
                  : 'border-scarlet-100 border-b-teal-300'
              )}
            >
              Sell
            </div>
          )}
        </RadioGroup.Option>
      </RadioGroup>
      <Col
        className={clsx(
          'flex-1 gap-2 rounded-b-md border-2 p-4 transition-colors',
          isBuy
            ? 'border-teal-300 bg-teal-50'
            : 'border-scarlet-300 bg-scarlet-50'
        )}
      >
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
                    ({pricePerShare} avg)
                  </span>
                </>
              )}
            </div>
          </div>
        </Row>
        <Row className="items-end justify-between">
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
            color={isBuy ? 'green' : 'red'}
            size="xl"
            className="w-40 transition-colors"
            disabled={!amount}
            onClick={async () =>
              await swapCert({ certId: contract.id, amount: realAmount })
            }
          >
            {isBuy ? 'Buy' : 'Sell'}
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
