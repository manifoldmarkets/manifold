import clsx from 'clsx'

import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'

export const DashboardNewsItem = (props: {
  title?: string
  urlToImage?: string
  image?: string
  url: string
  description: string
  author?: string
  published_time?: number
  className?: string
  siteName?: string
}) => {
  const {
    title,
    image,
    urlToImage,
    url,
    description,
    published_time,
    className,
    siteName,
  } = props
  const date = Date.parse(published_time as any)
  return (
    <Link
      href={url}
      onClick={() => track('click news article', { article: title })}
      rel="noreferrer"
      target="_blank"
      className={clsx(
        'border-canvas-0 bg-canvas-0 hover:border-primary-300 focus:border-primary-300 relative flex w-full flex-col overflow-hidden rounded-xl border transition-colors sm:flex-row',
        className
      )}
    >
      <img
        className=" m-0 object-cover sm:w-1/3"
        src={image ?? urlToImage}
        alt={title}
        height={200}
      />
      <Col className=" border-canvas-0 w-full bg-opacity-80 py-2 px-4 sm:pr-6 ">
        <Row className="text-ink-500 w-full justify-between text-sm">
          <div>{siteName ? siteName : ''}</div>
          {published_time && (
            <span>
              published
              {
                <RelativeTimestamp
                  time={date}
                  shortened={true}
                  className="text-ink-500"
                />
              }
            </span>
          )}
        </Row>
        <div className="line-clamp-2 text-lg">{title}</div>
        <div className="line-clamp-3 text-sm">{description}</div>
      </Col>
    </Link>
  )
}

export const DashboardNewsItemPlaceholder = () => {
  return (
    <div
      className={clsx(
        'border-ink-500 bg-canvas-0 hover:border-primary-300 focus:border-primary-300 relative flex w-full w-full animate-pulse flex-col overflow-hidden rounded-xl border transition-colors sm:flex-row'
      )}
    >
      <div className=" bg-ink-500 m-0 h-[120px] sm:w-1/3" />
      <Col className=" border-canvas-0 w-full bg-opacity-80 py-2 px-4 sm:pr-6">
        <div className="bg-ink-600 mb-2 h-3 w-12" />

        <div className="bg-ink-600 mb-2 h-6" />

        <Col className="gap-2">
          <div className="bg-ink-600 h-3" />
          <div className="bg-ink-600 h-3" />
        </Col>
      </Col>
    </div>
  )
}
