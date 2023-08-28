import dayjs from 'dayjs'
import clsx from 'clsx'

import { track } from 'web/lib/service/analytics'
import { Col } from 'web/components/layout/col'
import Link from 'next/link'
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
  source_name?: string
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
    source_name,
  } = props

  console.log(props)

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
        className=" object-contains m-0 sm:w-1/3"
        src={image ?? urlToImage}
        alt={title}
        height={200}
      />
      <Col className=" border-canvas-0 w-full bg-opacity-80 py-2 sm:pl-4 sm:pr-6 ">
        <Row className="text-ink-500 w-full justify-between text-sm">
          <div>{props.siteName ? props.siteName : 'News'}</div>
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
        {/* <div className="line-clamp-3 text-ink-600 text-xs">
          {author}
          {published_time && ` / ${dayjs.utc(published_time).fromNow()}`}
        </div> */}
        <div className="line-clamp-3 text-sm">{description}</div>
      </Col>
    </Link>
  )
}
