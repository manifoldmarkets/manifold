import clsx from 'clsx'
import { Row } from './layout/row'
import { Linkify } from './linkify'
import { SiteLink } from './site-link'
import { Fold } from '../../common/fold'

export function Hashtag(props: { tag: string; noLink?: boolean }) {
  const { tag, noLink } = props
  const body = (
    <div
      className={clsx(
        'bg-white hover:bg-gray-100 px-4 py-2 rounded-full shadow-md',
        !noLink && 'cursor-pointer'
      )}
    >
      <span className="text-gray-500">{tag}</span>
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
}) {
  const { tags, className, noLink } = props
  return (
    <Row className={clsx('flex-wrap gap-2', className)}>
      {tags.map((tag) => (
        <Hashtag key={tag} tag={tag} noLink={noLink} />
      ))}
    </Row>
  )
}

export function CompactTagsList(props: { tags: string[] }) {
  const { tags } = props
  return (
    <Row className="gap-2 flex-wrap text-sm text-gray-500">
      {tags.map((tag) => (
        <div key={tag} className="bg-gray-100 px-1">
          <Linkify text={tag} gray />
        </div>
      ))}
    </Row>
  )
}

export function FoldTag(props: { fold: Fold }) {
  const { fold } = props
  const { name } = fold
  return (
    <SiteLink href={`/fold/${fold.slug}`} className="flex items-center">
      <div
        className={clsx(
          'bg-indigo-50 px-4 py-2 rounded-full shadow-md',
          'cursor-pointer'
        )}
      >
        <span className="text-gray-500 text-sm">{name}</span>
      </div>
    </SiteLink>
  )
}

export function FoldTagList(props: { folds: Fold[]; className?: string }) {
  const { folds, className } = props
  return (
    <Row className={clsx('flex-wrap gap-2 items-center', className)}>
      {folds.length > 0 && (
        <>
          <div className="text-gray-500 mr-1">Communities</div>
          {folds.map((fold) => (
            <FoldTag key={fold.id} fold={fold} />
          ))}
        </>
      )}
    </Row>
  )
}
