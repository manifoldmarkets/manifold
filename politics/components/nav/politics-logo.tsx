import clsx from 'clsx'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'

export function PoliticsLogo(props: { className?: string }) {
  const { className } = props

  return (
    <Link
      href="/"
      className={clsx(
        'group flex w-full flex-row items-center gap-2 px-1 outline-none',
        className
      )}
      onClick={(e) => {
        if (window.location.pathname == '/') {
          e.preventDefault()
        }
      }}
    >
      <img
        src="/logo.svg"
        className="h-12 w-12 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
        aria-hidden
      />
      <Col className="my-auto font-mono text-lg">
        <div className="-mb-2">MANIFOLD</div>
        <div>POLITICS</div>
      </Col>
    </Link>
  )
}
