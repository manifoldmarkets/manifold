import { Col } from 'web/components/layout/col'
import Link from 'next/link'
import clsx from 'clsx'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import dayjs from 'dayjs'
import { BiNews } from 'react-icons/bi'
import { Spacer } from '../layout/spacer'

export const NewsArticle = (props: {
  title: string
  urlToImage: string
  url: string
  description: string
  author: string
  source_name?: string
  published_time?: number
}) => {
  const { title, urlToImage, url, description, published_time } = props
  const date = Date.parse(published_time as any)
  return (
    <Link href={url} target="_blank" className="relative flex w-full flex-col">
      <div className="relative">
        <img
          className={clsx('h-50 m-0 object-cover')}
          src={urlToImage}
          alt={title}
        />

        <Col className="bg-canvas-0 absolute bottom-0 px-4 py-2 opacity-90 sm:px-6">
          <Row className="text-ink-500 w-full justify-between text-sm">
            <div>{props.source_name ? props.source_name : 'News'}</div>
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
          <Spacer h={1.5} />
          <div className="line-clamp-3 text-sm">{description}</div>
        </Col>
      </div>
    </Link>
  )
}
