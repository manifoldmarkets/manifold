import clsx from 'clsx'
import Link from 'next/link'
import { groupPath } from 'common/group'
import { track } from 'web/lib/service/analytics'
import { LockClosedIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'
import { removeEmojis } from 'common/topics'

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

  const noEmojis = removeEmojis(topic.name)

  return (
    <Row
      className={clsx(
        'text-ink-500 hover:text-ink-700 hover:bg-primary-100 group items-center gap-1' +
          'whitespace-nowrap rounded px-1 py-0.5 text-sm transition-colors',
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
        className={'max-w-[200px] truncate sm:max-w-[250px]'}
      >
        {isPrivate ? (
          <LockClosedIcon className="my-auto mr-0.5 h-3 w-3" />
        ) : (
          <span className="mr-px opacity-50 transition-opacity group-hover:opacity-100">
            #
          </span>
        )}
        {noEmojis || topic.name}
      </Link>
      {children}
    </Row>
  )
}
