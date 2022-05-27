import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'web/lib/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export type ManalinkInfo = {
  expiresTime: number | null
  maxUses: number | null
  uses: number
  amount: number
  message: string
}

export function ManalinkCard(props: {
  className?: string
  info: ManalinkInfo
  defaultMessage: string
  isClaiming: boolean
  onClaim?: () => void
}) {
  const { className, defaultMessage, isClaiming, info, onClaim } = props
  const { expiresTime, maxUses, uses, amount, message } = info
  return (
    <div
      className={clsx(
        className,
        'min-h-20 group flex flex-col rounded-xl bg-gradient-to-br from-indigo-200 via-indigo-400 to-indigo-800 shadow-lg transition-all'
      )}
    >
      <Col className="mx-4 mt-2 -mb-4 text-right text-sm text-gray-100">
        <div>
          {maxUses != null
            ? `${maxUses - uses}/${maxUses} uses left`
            : `Infinite use`}
        </div>
        <div>
          {expiresTime != null
            ? `Expires ${fromNow(expiresTime)}`
            : 'Never expires'}
        </div>
      </Col>

      <img
        className="mb-6 block self-center transition-all group-hover:rotate-12"
        src="/logo-white.svg"
        width={200}
        height={200}
      />
      <Row className="justify-end rounded-b-xl bg-white p-4">
        <Col>
          <div className="mb-1 text-xl text-indigo-500">
            {formatMoney(amount)}
          </div>
          <div>{message || defaultMessage}</div>
        </Col>

        <div className="ml-auto">
          <button
            className={clsx('btn', isClaiming ? 'loading disabled' : '')}
            onClick={onClaim}
          >
            {isClaiming ? '' : 'Claim'}
          </button>
        </div>
      </Row>
    </div>
  )
}
