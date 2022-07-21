import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'web/lib/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Claim, Manalink } from 'common/manalink'
import { useState } from 'react'
import { ShareIconButton } from './share-icon-button'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { contractDetailsButtonClassName } from './contract/contract-info-dialog'
import { useUserById } from 'web/hooks/use-user'
import getManalinkUrl from 'web/get-manalink-url'
export type ManalinkInfo = {
  expiresTime: number | null
  maxUses: number | null
  uses: number
  amount: number
  message: string
}

export function ManalinkCard(props: {
  info: ManalinkInfo
  className?: string
  preview?: boolean
}) {
  const { className, info, preview = false } = props
  const { expiresTime, maxUses, uses, amount, message } = info
  return (
    <Col>
      <div
        className={clsx(
          className,
          'min-h-20 group flex flex-col rounded-xl bg-gradient-to-br shadow-lg transition-all',
          getManalinkGradient(info.amount)
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
          className={clsx(
            'block h-1/3 w-1/3 self-center transition-all group-hover:rotate-12',
            preview ? 'my-2' : 'w-1/2 md:mb-6 md:h-1/2'
          )}
          src="/logo-white.svg"
        />
        <Row className="rounded-b-xl bg-white p-4">
          <Col>
            <div
              className={clsx(
                'mb-1 text-xl text-indigo-500',
                getManalinkAmountColor(amount)
              )}
            >
              {formatMoney(amount)}
            </div>
            <div>{message}</div>
          </Col>
        </Row>
      </div>
    </Col>
  )
}

export function ManalinkCardFromView(props: {
  className?: string
  link: Manalink
  highlightedSlug: string
}) {
  const { className, link, highlightedSlug } = props
  const { message, amount, expiresTime, maxUses, claims } = link
  const [details, setDetails] = useState(false)

  return (
    <Col
      className={clsx(
        'group z-10 rounded-lg drop-shadow-sm transition-all hover:drop-shadow-lg',
        className,
        link.slug === highlightedSlug ? 'animate-pulse' : ''
      )}
    >
      <div
        className={clsx(
          'relative flex flex-col rounded-t-lg bg-gradient-to-br transition-all',
          getManalinkGradient(link.amount)
        )}
        onClick={() => setDetails(!details)}
      >
        {details && (
          <ClaimsList
            className="absolute h-full w-full bg-white opacity-90"
            link={link}
          />
        )}
        <Col className="mx-4 mt-2 -mb-4 text-right text-xs text-gray-100">
          <div>
            {maxUses != null
              ? `${maxUses - claims.length}/${maxUses} uses left`
              : `Unlimited use`}
          </div>
          <div>
            {expiresTime != null
              ? `Expires ${fromNow(expiresTime)}`
              : 'Never expires'}
          </div>
        </Col>
        <img
          className={clsx('my-auto block w-1/3 select-none self-center py-3')}
          src="/logo-white.svg"
        />
      </div>
      <Col className="w-full rounded-b-lg bg-white px-4 py-2 text-lg">
        <Row className="relative gap-1">
          <div
            className={clsx(
              'my-auto mb-1 w-full',
              getManalinkAmountColor(amount)
            )}
          >
            {formatMoney(amount)}
          </div>
          <ShareIconButton
            toastClassName={'-left-48 min-w-[250%]'}
            buttonClassName={'transition-colors'}
            onCopyButtonClassName={
              'bg-gray-200 text-gray-600 transition-none hover:bg-gray-200 hover:text-gray-600'
            }
            copyPayload={getManalinkUrl(link.slug)}
          />
          <button
            onClick={() => setDetails(!details)}
            className={clsx(
              contractDetailsButtonClassName,
              details
                ? 'bg-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-600'
                : ''
            )}
          >
            <DotsHorizontalIcon className="h-[24px] w-5" />
          </button>
        </Row>
        <div className="my-2 text-xs md:text-sm">{message || '\n\n'}</div>
      </Col>
    </Col>
  )
}

function ClaimsList(props: { link: Manalink; className: string }) {
  const { link, className } = props
  return (
    <>
      <Col className={clsx('px-4 py-2', className)}>
        <div className="text-md mb-1 mt-2 w-full font-semibold">
          Claimed by...
        </div>
        <div className="overflow-auto">
          {link.claims.length > 0 ? (
            <>
              {link.claims.map((claim) => (
                <Row key={claim.txnId}>
                  <Claim claim={claim} />
                </Row>
              ))}
            </>
          ) : (
            <div className="h-full">
              No one has claimed this manalink yet! Share your manalink to start
              spreading the wealth.
            </div>
          )}
        </div>
      </Col>
    </>
  )
}

function Claim(props: { claim: Claim }) {
  const { claim } = props
  const who = useUserById(claim.toId)
  return (
    <Row className="my-1 gap-2 text-xs">
      <div>{who?.name || 'Loading...'}</div>
      <div className="text-gray-500">{fromNow(claim.claimedTime)}</div>
    </Row>
  )
}

function getManalinkGradient(amount: number) {
  if (amount < 20) {
    return 'from-indigo-200 via-indigo-500 to-indigo-800'
  } else if (amount >= 20 && amount < 50) {
    return 'from-fuchsia-200 via-fuchsia-500 to-fuchsia-800'
  } else if (amount >= 50 && amount < 100) {
    return 'from-rose-100 via-rose-400 to-rose-700'
  } else if (amount >= 100) {
    return 'from-amber-200 via-amber-500 to-amber-700'
  }
}

function getManalinkAmountColor(amount: number) {
  if (amount < 20) {
    return 'text-indigo-500'
  } else if (amount >= 20 && amount < 50) {
    return 'text-fuchsia-600'
  } else if (amount >= 50 && amount < 100) {
    return 'text-rose-600'
  } else if (amount >= 100) {
    return 'text-amber-600'
  }
}
