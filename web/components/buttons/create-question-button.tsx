import { buttonClass } from './button'
import clsx from 'clsx'
import Link from 'next/link'

export const CreateQuestionButton = (props: { className?: string }) => {
  const { className } = props
  return (
    <Link
      href="/create"
      className={clsx(
        buttonClass('xl', 'gradient'),
        'w-full whitespace-nowrap',
        className
      )}
    >
      <span>
        Create <span className="lg:hidden xl:inline">a</span> question
      </span>
    </Link>
  )
}
