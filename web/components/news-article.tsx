import dayjs from 'dayjs'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import Link from 'next/link'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { Content } from './widgets/editor'

export const NewsArticle = (props: {
  title: string
  urlToImage: string
  url: string
  description: string
  author: string
  published_time: number
}) => {
  const { title, urlToImage, url, description, published_time, author } = props

  return (
    <Link href={url} className="relative flex w-full flex-col">
      <Col className="bg-canvas-0 px-4 pt-3 pb-2">
        <div className="line-clamp-2 text-lg">{title}</div>
        <div className="line-clamp-3 text-sm">
          {author && `${author} `}
          <span className={'text-ink-500'}>
            {shortenedFromNow(dayjs.utc(published_time) as unknown as number)}
          </span>
        </div>
        <div className="line-clamp-3 text-sm">{description}</div>
      </Col>
      <img
        className="m-0 object-contain "
        src={urlToImage}
        alt={title}
        height={100}
      />
    </Link>
  )
}
