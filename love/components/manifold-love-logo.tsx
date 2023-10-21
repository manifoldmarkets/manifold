import Link from 'next/link'
import LoveLogo from '../public/manifold_love_logo.svg'
import { useUser } from 'web/hooks/use-user'
import clsx from 'clsx'
import { ENV } from 'common/envs/constants'

export default function ManifoldLoveLogo() {
  const user = useUser()
  return (
    <Link
      href={user ? '/home' : '/'}
      className=" flex flex-row gap-1 pb-3 pt-6"
    >
      <LoveLogo
        className="h-10 w-10 shrink-0 transition-transform group-hover:rotate-12 dark:stroke-pink-300"
        aria-hidden
      />
      <div className={clsx('my-auto text-xl font-thin')}>
        {ENV == 'DEV' ? 'devifold' : 'manifold'}
        <span className="mx-[1px]">.</span>
        <span className="font-semibold text-pink-800 dark:text-pink-300">
          love
        </span>
      </div>
    </Link>
  )
}
