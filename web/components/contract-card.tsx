import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../components/layout/row'
import { formatMoney } from '../lib/util/format'
import { UserLink } from './user-page'
import { Linkify } from './linkify'
import {
  Contract,
  contractMetrics,
  contractPath,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { parseTags } from '../lib/util/parse'
import dayjs from 'dayjs'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
}) {
  const { contract, showHotVolume } = props
  const { question, resolution } = contract
  const { probPercent } = contractMetrics(contract)

  return (
    <Link href={contractPath(contract)}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-md rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <Row className="justify-between gap-4 mb-2">
                <p className="font-medium text-indigo-700">{question}</p>
                <ResolutionOrChance
                  className="items-center"
                  resolution={resolution}
                  probPercent={probPercent}
                />
              </Row>
              <AbbrContractDetails
                contract={contract}
                showHotVolume={showHotVolume}
              />
            </div>
          </div>
        </li>
      </a>
    </Link>
  )
}

export function ResolutionOrChance(props: {
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
  probPercent: string
  large?: boolean
  className?: string
}) {
  const { resolution, probPercent, large, className } = props

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    MKT: 'text-blue-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[resolution || '']

  const resolutionText = {
    YES: 'YES',
    NO: 'NO',
    MKT: 'MKT',
    CANCEL: 'N/A',
    '': '',
  }[resolution || '']

  return (
    <Col className={clsx(large ? 'text-4xl' : 'text-3xl', className)}>
      {resolution ? (
        <>
          <div
            className={clsx('text-gray-500', large ? 'text-xl' : 'text-base')}
          >
            Resolved
          </div>
          <div className={resolutionColor}>{resolutionText}</div>
        </>
      ) : (
        <>
          <div className="text-primary">{probPercent}</div>
          <div
            className={clsx('text-primary', large ? 'text-xl' : 'text-base')}
          >
            chance
          </div>
        </>
      )}
    </Col>
  )
}

export function AbbrContractDetails(props: {
  contract: Contract
  showHotVolume?: boolean
}) {
  const { contract, showHotVolume } = props
  const { volume24Hours } = contract
  const { truePool } = contractMetrics(contract)

  return (
    <Col className={clsx('text-sm text-gray-500 gap-2')}>
      <Row className="gap-2 flex-wrap">
        <div className="whitespace-nowrap">
          <UserLink username={contract.creatorUsername} />
        </div>
        <div>•</div>
        {showHotVolume ? (
          <div className="whitespace-nowrap">
            {formatMoney(volume24Hours)} 24h vol
          </div>
        ) : (
          <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
        )}
      </Row>
    </Col>
  )
}

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { question, description, closeTime } = contract
  const { truePool, createdDate, resolvedDate } = contractMetrics(contract)

  const tags = parseTags(`${question} ${description}`).map((tag) => `#${tag}`)

  return (
    <Col className="text-sm text-gray-500 gap-2 sm:flex-row sm:flex-wrap">
      <Row className="gap-2 flex-wrap">
        <div className="whitespace-nowrap">
          <UserLink username={contract.creatorUsername} />
        </div>
        <div className="">•</div>
        <div className="whitespace-nowrap">
          {resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}
        </div>
        {!resolvedDate && closeTime && (
          <>
            <div className="">•</div>
            <div className="whitespace-nowrap">
              {closeTime > Date.now() ? 'Closes' : 'Closed'}{' '}
              {dayjs(closeTime).format('MMM D, h:mma')}
            </div>
          </>
        )}
        <div className="">•</div>
        <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
      </Row>

      {tags.length > 0 && (
        <>
          <div className="hidden sm:block">•</div>

          <Row className="gap-2 flex-wrap">
            {tags.map((tag) => (
              <div key={tag} className="bg-gray-100 px-1">
                <Linkify text={tag} gray />
              </div>
            ))}
          </Row>
        </>
      )}
    </Col>
  )
}

// String version of the above, to send to the OpenGraph image generator
export function contractTextDetails(contract: Contract) {
  const { question, description, closeTime } = contract
  const { truePool, createdDate, resolvedDate } = contractMetrics(contract)

  const tags = parseTags(`${question} ${description}`).map((tag) => `#${tag}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${formatMoney(truePool)} pool` +
    (tags.length > 0 ? ` • ${tags.join(' ')}` : '')
  )
}
