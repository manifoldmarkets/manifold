import clsx from 'clsx'
import { BiGame } from 'react-icons/bi'
import { PiDiamond, PiDiamondFill } from 'react-icons/pi'
import { IoTriangle, IoTriangleOutline } from 'react-icons/io5'
import { LogoIcon } from 'web/components/icons/logo-icon'

export function PlayTier(props: { className?: string }) {
  const { className } = props
  return (
    <div
      className="inline-flex items-center justify-center"
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    >
      <PiDiamond
        className={clsx('text-ink-400 mx-auto my-auto', className)}
        style={{
          width: '.7em',
          height: '.7em',
        }}
      />
    </div>
  )
}

export function BasicTier(props: { className?: string }) {
  const { className } = props
  return (
    <div
      className="inline-flex items-center justify-center"
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    >
      <LogoIcon
        className={clsx('text-ink-900 stroke-[1.5px] mx-auto my-auto', className)}
        style={{
          width: '1em',
          height: '1em',
        }}
      />
    </div>
  )
}

export function PlusTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Plus.svg"
      alt={'➕'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}

export function PremiumTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Premium.svg"
      alt={'💎'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}

export function CrystalTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Crystal.svg"
      alt={'🔮'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
