import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'web/lib/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'web/lib/firebase/users'
import { Button } from './button'
import { Claim, Manalink } from 'common/manalink'
import { useState } from 'react'
import { ShareIconButton } from './share-icon-button'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { contractDetailsButtonClassName } from './contract/contract-info-dialog'
import { useUserById } from 'web/hooks/use-user'
export type ManalinkInfo = {
  expiresTime: number | null
  maxUses: number | null
  uses: number
  amount: number
  message: string
}

export function ManalinkCard(props: {
  user?: User | null | undefined
  className?: string
  info: ManalinkInfo
  isClaiming?: boolean
  onClaim?: () => void
  preview?: boolean
}) {
  const { user, className, isClaiming, info, onClaim, preview = false } = props
  const { expiresTime, maxUses, uses, amount, message } = info
  return (
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
          'ransition-all block h-1/3 w-1/3 self-center group-hover:rotate-12',
          preview ? 'my-2' : 'w-1/2 md:mb-6 md:h-1/2'
        )}
        src="/logo-white.svg"
      />
      <Row
        className={clsx(
          'rounded-b-xl bg-white p-4',
          preview ? '' : 'justify-end'
        )}
      >
        <Col>
          <div className="mb-1 text-xl text-indigo-500">
            {formatMoney(amount)}
          </div>
          <div>{message}</div>
        </Col>

        {!preview && (
          <div className="ml-auto">
            <Button onClick={onClaim} disabled={isClaiming}>
              {user ? 'Claim' : 'Login'}
            </Button>
          </div>
        )}
      </Row>
    </div>
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
    <>
      <Col
        className={clsx(
          'group z-10 rounded-lg drop-shadow-sm transition-all hover:drop-shadow-lg',
          className,
          link.slug === highlightedSlug
            ? 'shadow-lg shadow-indigo-500 transition-none'
            : ''
        )}
      >
        <div
          className={clsx(
            'relative flex flex-col rounded-t-lg bg-gradient-to-br transition-all',
            getManalinkGradient(link.amount)
          )}
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
            className={clsx(
              'my-auto block w-1/3 self-center py-3 transition-all',
              details ? '' : 'group-hover:rotate-12'
            )}
            src="/logo-white.svg"
          />
        </div>
        <Col className="w-full rounded-b-lg bg-white px-4 py-2 text-lg">
          <Row className="relative gap-1">
            <div className="my-auto mb-1 w-full text-indigo-500">
              {formatMoney(amount)}
            </div>
            <ShareIconButton
              manalink={link}
              toastClassName={'-left-48 min-w-[250%]'}
              buttonClassName={'transition-colors'}
              onCopyButtonClassName={
                'bg-indigo-100 text-indigo-500 transition-none hover:bg-indigo-100 hover:text-indigo-500'
              }
            />
            <button
              onClick={() => setDetails(!details)}
              className={clsx(
                contractDetailsButtonClassName,
                details
                  ? 'bg-indigo-100 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-500'
                  : ''
              )}
            >
              <DotsHorizontalIcon className="h-[24px] w-5" />
            </button>
          </Row>
          <div className="my-2 text-xs md:text-sm">{message || '\n\n'}</div>
        </Col>
      </Col>
    </>
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
                <Row>
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
    return 'from-slate-300 via-slate-500 to-slate-800'
  } else if (amount >= 20 && amount < 50) {
    return 'from-indigo-300 via-indigo-500 to-indigo-800'
  } else if (amount >= 50 && amount < 100) {
    return 'from-violet-300 via-violet-500 to-violet-800'
  } else if (amount >= 100) {
    return 'from-indigo-300 via-violet-500 to-rose-400'
  }
}
