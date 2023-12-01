import Link from 'next/link'
import LoveLogo from '../public/manifold_love_logo.svg'
import clsx from 'clsx'
import { ENV } from 'common/envs/constants'
import { Row } from 'web/components/layout/row'

export default function ManifoldLoveLogo(props: {
  noLink?: boolean
  className?: string
}) {
  const { noLink, className } = props
  const inner = (
    <>
      <LoveLogo
        className="h-10 w-10 shrink-0 stroke-pink-700 transition-transform dark:stroke-pink-300"
        aria-hidden
      />
      <div className={clsx('my-auto text-xl font-thin')}>
        {ENV == 'DEV' ? 'devifold' : 'manifold'}
        <span className="mx-[1px]">.</span>
        <span className="font-semibold text-pink-700 dark:text-pink-300">
          love
        </span>
      </div>
    </>
  )
  if (noLink) {
    return <Row className="gap-1 pb-3 pt-6">{inner}</Row>
  }
  return (
    <Link
      href={'/'}
      className={clsx('flex flex-row gap-1 pb-3 pt-6', className)}
    >
      {inner}
    </Link>
  )
}
