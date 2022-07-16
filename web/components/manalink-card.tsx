import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'web/lib/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'web/lib/firebase/users'
import { Button } from './button'

export type ManalinkInfo = {
  expiresTime: number | null
  maxUses: number | null
  uses: number
  amount: number
  message: string
}

export function ManalinkCard(props: {
  user: User | null | undefined
  className?: string
  info: ManalinkInfo
  isClaiming: boolean
  onClaim?: () => void
}) {
  const { user, className, isClaiming, info, onClaim } = props
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
            : `Unlimited use`}
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
          <div>{message}</div>
        </Col>

        <div className="ml-auto">
          <Button onClick={onClaim} disabled={isClaiming}>
            {user ? 'Claim' : 'Login'}
          </Button>
        </div>
      </Row>
    </div>
  )
}

export function ManalinkCardPreview(props: {
  className?: string
  info: ManalinkInfo
}) {
  const { className, info } = props
  const { expiresTime, maxUses, uses, amount, message } = info
  return (
    <div
      className={clsx(
        className,
        ' group flex flex-col rounded-lg bg-gradient-to-br from-indigo-200 via-indigo-400 to-indigo-800 shadow-lg transition-all'
      )}
    >
      <Col className="mx-4 mt-2 -mb-4 text-right text-xs text-gray-100">
        <div>
          {maxUses != null
            ? `${maxUses - uses}/${maxUses} uses left`
            : `Unlimited use`}
        </div>
        <div>
          {expiresTime != null
            ? `Expires ${fromNow(expiresTime)}`
            : 'Never expires'}
        </div>
      </Col>

      <img
        className="my-2 block h-1/3 w-1/3 self-center transition-all group-hover:rotate-12"
        src="/logo-white.svg"
      />
      <Row className="rounded-b-lg bg-white p-2">
        <Col className="text-md">
          <div className="mb-1 text-indigo-500">{formatMoney(amount)}</div>
          <div className="text-xs">{message}</div>
        </Col>
      </Row>
    </div>
  )
}
