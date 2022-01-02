import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../components/layout/row'
import { formatMoney } from '../lib/util/format'
import { UserLink } from './user-page'
import { Linkify } from './linkify'
import { Contract, compute, path } from '../lib/firebase/contracts'

export function ContractCard(props: { contract: Contract }) {
  const { contract } = props
  const { probPercent } = compute(contract)

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    MKT: 'text-blue-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[contract.resolution || '']

  const resolutionText = {
    YES: 'YES',
    NO: 'NO',
    MKT: 'MKT',
    CANCEL: 'N/A',
    '': '',
  }[contract.resolution || '']

  return (
    <Link href={path(contract)}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-md rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <Row className="justify-between gap-4 mb-2">
                <p className="font-medium text-indigo-700">
                  <Linkify text={contract.question} />
                </p>
                <div className={clsx('text-4xl', resolutionColor)}>
                  {resolutionText || (
                    <div className="text-primary">
                      {probPercent}
                      <div className="text-lg">chance</div>
                    </div>
                  )}
                </div>
              </Row>
              <ContractDetails contract={contract} />
            </div>
          </div>
        </li>
      </a>
    </Link>
  )
}

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { truePool, createdDate, resolvedDate } = compute(contract)

  return (
    <Row className="flex-wrap text-sm text-gray-500">
      <div className="whitespace-nowrap">
        <UserLink username={contract.creatorUsername} />
      </div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">
        {resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}
      </div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
    </Row>
  )
}
