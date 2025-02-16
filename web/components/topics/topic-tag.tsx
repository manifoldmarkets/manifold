import clsx from 'clsx'
import Link from 'next/link'
import { groupPath } from 'common/group'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { removeEmojis } from 'common/util/string'

export function TopicTag(props: {
  topic: { slug: string; name: string }
  location:
    | 'feed card'
    | 'market page'
    | 'categories list'
    | 'create page'
    | 'questions page'
    | 'dashboard page'
  className?: string
  children?: React.ReactNode // end element - usually for a remove button
  onClick?: () => void
}) {
  const { topic, location, className, children } = props

  const noEmojis = removeEmojis(topic.name)

  return (
    <Row
      className={clsx(
        'group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
        'bg-canvas-50 text-ink-600 transition-colors hover:bg-canvas-100 hover:text-ink-800',
        className
      )}
    >
      <Link
        prefetch={false}
        href={groupPath(topic.slug)}
        onClick={(e) => {
          e.stopPropagation()
          if (props.onClick) {
            props.onClick()
          } else {
            track(`click category tag`, {
              categoryName: topic.name,
              location,
            })
          }
        }}
        className="max-w-[200px] truncate sm:max-w-[250px]"
      >
        {noEmojis || topic.name}
      </Link>
      {children}
    </Row>
  )
}
