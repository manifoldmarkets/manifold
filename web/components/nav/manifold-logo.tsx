import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import { LogoIcon } from 'web/components/icons/logo-icon'
import { Tooltip } from '../widgets/tooltip'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const user = useUser()

  return (
    <>
      <Link
        href={user ? '/home' : '/'}
        onClick={(e) => {
          if (window.location.pathname == '/home') {
            e.preventDefault()
          }
        }}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        <LogoIcon
          className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
          aria-hidden
        />
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {ENV == 'DEV' ? 'DEVIFO️LD' : 'MANIFOLD'}
        </div>
      </Link>
    </>
  )
}

export function MemorialLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props

  return (
    <Tooltip text="RIP Max Chiswick">
      <Link
        href="https://blog.rossry.net/chisness/"
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'group flex w-full flex-row items-center justify-center gap-0.5 bg-black px-1 outline-none',
          className
        )}
      >
        <LogoIcon
          className="h-10 w-10 shrink-0 stroke-white transition-transform group-hover:-rotate-3"
          aria-hidden
        />
        <div className={clsx('text-xl font-thin text-white')}>MANIFOLD</div>
      </Link>
    </Tooltip>
  )
}
