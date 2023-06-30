import dayjs from 'dayjs'
import clsx from 'clsx'

import { track } from 'web/lib/service/analytics'
import { Col } from 'web/components/layout/col'

export const DashboardNewsItem = (props: {
  title: string
  urlToImage?: string
  image?: string
  url: string
  description: string
  author?: string
  published_time?: number
  className?: string
}) => {
  const {
    title,
    image,
    urlToImage,
    url,
    description,
    published_time,
    author,
    className,
  } = props

  return (
    <Col className={clsx('relative w-full', className)}>
      <img
        className="border-ink-300 m-0 rounded-t-lg border object-contain "
        src={image ?? urlToImage}
        alt={title}
        height={200}
      />

      <a
        className={'absolute inset-0 z-10'}
        href={url}
        target="_blank"
        onClick={() => track('click news article', { article: title })}
      />

      <Col className="bg-canvas-0 border-canvas-0 rounded-b-lg border border-t-0 p-2 hover:underline">
        <div className="line-clamp-2 text-ink-900 text-lg">{title}</div>
        <div className="line-clamp-3 text-ink-600 text-xs">
          {author}
          {published_time && ` / ${dayjs.utc(published_time).fromNow()}`}
        </div>
        <div className="line-clamp-3 text-ink-600 text-xs">{description}</div>
      </Col>
    </Col>
  )
}