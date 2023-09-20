import clsx from 'clsx'
import Link from 'next/link'
import { groupPath } from 'common/group'
import { track } from 'web/lib/service/analytics'
import { LockClosedIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'

export function TopicTag(props: {
  topic: { slug: string; name: string }
  location:
    | 'feed card'
    | 'market page'
    | 'categories list'
    | 'create page'
    | 'questions page'
  isPrivate?: boolean
  className?: string
  children?: React.ReactNode // end element - usually for a remove button
}) {
  const { topic, isPrivate, className, children } = props

  return (
    <Row
      className={clsx(
        'text-ink-500 dark:text-ink-400 hover:text-ink-600 hover:bg-primary-400/10 group gap-1 ' +
          'whitespace-nowrap rounded px-1 py-0.5 text-right text-sm transition-colors',
        className
      )}
    >
      <Link
        prefetch={false}
        href={groupPath(topic.slug)}
        onClick={(e) => {
          e.stopPropagation()
          track(`click category tag on ${location}`, {
            categoryName: topic.name,
          })
        }}
        className={' max-w-[200px] truncate sm:max-w-[250px]'}
      >
        {isPrivate ? (
          <LockClosedIcon className="my-auto mr-0.5 h-3 w-3" />
        ) : (
          <span className="mr-px opacity-50 transition-colors group-hover:text-inherit">
            #
          </span>
        )}
        {topic.name}
      </Link>
      {children}
    </Row>
  )
}
