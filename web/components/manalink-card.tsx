import { useState } from 'react'
import clsx from 'clsx'
import { QrcodeIcon } from '@heroicons/react/outline'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'web/lib/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Claim, Manalink } from 'common/manalink'
import { useUserById } from 'web/hooks/use-user'
import { IconButton } from './buttons/button'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'

export type ManalinkInfo = {
  expiresTime: number | null
  maxUses: number | null
  uses: number
  amount: number
  message: string
}

export function linkClaimed(info: ManalinkInfo) {
  return (
    (info.maxUses != null && info.uses >= info.maxUses) ||
    (info.expiresTime != null && info.expiresTime < Date.now())
  )
}

export function toInfo(manalink: Manalink): ManalinkInfo {
  return {
    expiresTime: manalink.expiresTime,
    maxUses: manalink.maxUses,
    uses: manalink.claims.length,
    amount: manalink.amount,
    message: manalink.message,
  }
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
      <Col
        className={clsx(
          className,
          'min-h-20 group rounded-lg bg-gradient-to-br drop-shadow-sm transition-all',
          getManalinkGradient(info)
        )}
      >
        <Col className="text-ink-100 mx-4 mt-2 -mb-4 text-right text-sm">
          <div>
            {maxUses != null
              ? `${maxUses - uses}/${maxUses} uses left`
              : `Unlimited use`}
          </div>
          <div>
            {expiresTime != null
              ? `Expire${expiresTime < Date.now() ? 'd' : 's'} ${fromNow(
                  expiresTime
                )}`
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
        <Row className="bg-canvas-0 rounded-b-lg p-4">
          <div
            className={clsx(
              'text-primary-500 mb-1 text-xl',
              getManalinkAmountColor(info)
            )}
          >
            {formatMoney(amount)}
          </div>
        </Row>
      </Col>
      <div className="text-md text-ink-500 mt-2 mb-4">{message}</div>
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
  const [showDetails, setShowDetails] = useState(false)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${200}x${200}&data=${getManalinkUrl(
    link.slug
  )}`
  return (
    <Col>
      <Col
        className={clsx(
          'group z-10 rounded-lg drop-shadow-sm transition-all hover:drop-shadow-lg',
          className,
          link.slug === highlightedSlug ? 'shadow-primary-400 shadow-md' : ''
        )}
      >
        <Col
          className={clsx(
            'relative rounded-t-lg bg-gradient-to-br transition-all',
            getManalinkGradient(toInfo(link))
          )}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails && (
            <ClaimsList
              className="bg-canvas-0 absolute h-full w-full opacity-90"
              link={link}
            />
          )}
          <Col className="text-ink-100 mx-4 mt-2 -mb-4 text-right text-xs">
            <div>
              {maxUses != null
                ? `${maxUses - claims.length}/${maxUses} uses left`
                : `Unlimited use`}
            </div>
            <div>
              {expiresTime != null
                ? `Expire${expiresTime < Date.now() ? 'd' : 's'} ${fromNow(
                    expiresTime
                  )}`
                : 'Never expires'}
            </div>
          </Col>
          <img
            className={clsx('my-auto block w-1/3 select-none self-center py-3')}
            src="/logo-white.svg"
          />
        </Col>
        <Row className="bg-canvas-0 relative w-full rounded-b-lg px-4 py-2 align-middle text-lg">
          <div
            className={clsx(
              'my-auto mb-1 w-full',
              getManalinkAmountColor(toInfo(link))
            )}
          >
            {formatMoney(amount)}
          </div>

          <IconButton size="2xs" onClick={() => (window.location.href = qrUrl)}>
            <QrcodeIcon className="h-6 w-6" />
          </IconButton>

          <CopyLinkButton
            url={getManalinkUrl(link.slug)}
            linkIconOnlyProps={{
              tooltip: 'Copy link to Manalink',
            }}
          />
          <IconButton
            size="xs"
            onClick={() => setShowDetails(!showDetails)}
            className={clsx(
              showDetails ? ' text-primary-600 hover:text-primary-700' : ''
            )}
          >
            <DotsHorizontalIcon className="h-5 w-5" />
          </IconButton>
        </Row>
      </Col>
      <div className="text-ink-500 mt-2 mb-4 text-xs md:text-sm">
        {message || ''}
      </div>
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
      <div className="text-ink-500">{fromNow(claim.claimedTime)}</div>
    </Row>
  )
}

function getManalinkGradient(info: ManalinkInfo) {
  if (linkClaimed(info)) {
    return 'from-ink-200 via-ink-400 to-ink-600'
  }
  const { amount } = info
  if (amount < 200) {
    return 'from-primary-200 via-primary-500 to-primary-800'
  } else if (amount >= 200 && amount < 500) {
    return 'from-fuchsia-200 via-fuchsia-500 to-fuchsia-800'
  } else if (amount >= 500 && amount < 1000) {
    return 'from-rose-100 via-rose-400 to-rose-700'
  } else if (amount >= 1000) {
    return 'from-amber-200 via-amber-500 to-amber-700'
  }
}

function getManalinkAmountColor(info: ManalinkInfo) {
  if (linkClaimed(info)) {
    return 'text-ink-500'
  }
  const { amount } = info
  if (amount < 200) {
    return 'text-primary-500'
  } else if (amount >= 200 && amount < 500) {
    return 'text-fuchsia-600'
  } else if (amount >= 500 && amount < 1000) {
    return 'text-scarlet-500'
  } else if (amount >= 1000) {
    return 'text-amber-600'
  }
}

function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}
