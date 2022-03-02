import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from '../hooks/use-user'

export function ManifoldLogo(props: {
  className?: string
  darkBackground?: boolean
}) {
  const { darkBackground, className } = props

  const user = useUser()

  return (
    <Link href={user ? '/home' : '/'}>
      <a className={clsx('flex flex-shrink-0 flex-row gap-4', className)}>
        <img
          className="transition-all hover:rotate-12"
          src={darkBackground ? '/logo-white.svg' : '/logo.svg'}
          width={45}
          height={45}
        />
        <img src={'/theoremone/TheoremOne-Logo.svg'} width={245} height={45} />
      </a>
    </Link>
  )
}
