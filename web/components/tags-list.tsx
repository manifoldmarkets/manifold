import clsx from 'clsx'
import { Row } from './layout/row'
import { SiteLink } from './site-link'

function Hashtag(props: { tag: string; noLink?: boolean }) {
  const { tag, noLink } = props
  const body = (
    <div
      className={clsx(
        'bg-gray-100 border-2 px-3 py-1 rounded-full shadow-md',
        !noLink && 'cursor-pointer'
      )}
    >
      <span className="text-gray-600 text-sm">{tag}</span>
    </div>
  )

  if (noLink) return body
  return (
    <SiteLink href={`/tag/${tag.substring(1)}`} className="flex items-center">
      {body}
    </SiteLink>
  )
}

export function TagsList(props: {
  tags: string[]
  className?: string
  noLink?: boolean
  noLabel?: boolean
}) {
  const { tags, className, noLink, noLabel } = props
  return (
    <Row className={clsx('items-center flex-wrap gap-2', className)}>
      {!noLabel && <div className="text-gray-500 mr-1">Tags</div>}
      {tags.map((tag) => (
        <Hashtag
          key={tag}
          tag={tag.startsWith('#') ? tag : `#${tag}`}
          noLink={noLink}
        />
      ))}
    </Row>
  )
}

export function FoldTag(props: { fold: { slug: string; name: string } }) {
  const { fold } = props
  const { slug, name } = fold
  return (
    <SiteLink href={`/fold/${slug}`} className="flex items-center">
      <div
        className={clsx(
          'bg-white border-2 px-4 py-1 rounded-full shadow-md',
          'cursor-pointer'
        )}
      >
        <span className="text-gray-500 text-sm">{name}</span>
      </div>
    </SiteLink>
  )
}

export function FoldTagList(props: {
  folds: { slug: string; name: string }[]
  className?: string
}) {
  const { folds, className } = props
  return (
    <Row className={clsx('flex-wrap gap-2 items-center', className)}>
      {folds.length > 0 && (
        <>
          <div className="text-gray-500 mr-1">Communities</div>
          {folds.map((fold) => (
            <FoldTag key={fold.slug} fold={fold} />
          ))}
        </>
      )}
    </Row>
  )
}
