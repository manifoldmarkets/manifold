import clsx from 'clsx'
import { CATEGORIES } from '../../common/categories'
import { Col } from './layout/col'

import { Row } from './layout/row'
import { SiteLink } from './site-link'

function Hashtag(props: { tag: string; noLink?: boolean }) {
  const { tag, noLink } = props
  const category = CATEGORIES[tag.replace('#', '').toLowerCase()]
  console.log(tag, category)

  const body = (
    <div
      className={clsx(
        'rounded-full border-2 bg-gray-100 px-3 py-1 shadow-md',
        !noLink && 'cursor-pointer'
      )}
    >
      <span className="text-sm text-gray-600">{category ?? tag}</span>
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
  label?: string
}) {
  const { tags, className, noLink, noLabel, label } = props
  return (
    <Row className={clsx('flex-wrap items-center gap-2', className)}>
      {!noLabel && <div className="mr-1 text-gray-500">{label || 'Tags'}</div>}
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
          'rounded-full border-2 bg-white px-4 py-1 shadow-md',
          'cursor-pointer'
        )}
      >
        <span className="text-sm text-gray-500">{name}</span>
      </div>
    </SiteLink>
  )
}

export function FoldTagList(props: {
  folds: { slug: string; name: string }[]
  noLabel?: boolean
  className?: string
}) {
  const { folds, noLabel, className } = props
  return (
    <Col className="gap-2">
      {!noLabel && <div className="mr-1 text-gray-500">Communities</div>}
      <Row className={clsx('flex-wrap items-center gap-2', className)}>
        {folds.length > 0 && (
          <>
            {folds.map((fold) => (
              <FoldTag key={fold.slug} fold={fold} />
            ))}
          </>
        )}
      </Row>
    </Col>
  )
}
