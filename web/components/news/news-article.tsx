import { Col } from 'web/components/layout/col'
import Link from 'next/link'
import clsx from 'clsx'

export const NewsArticle = (props: {
  title: string
  urlToImage: string
  url: string
  description: string
  author: string
  published_time?: number
  className?: string
}) => {
  const { title, className, urlToImage, url, description } = props

  return (
    <Link href={url} target="_blank" className="relative flex w-full flex-col">
      <Col className="gap-1.5 px-4 pt-3 pb-2">
        <div className="line-clamp-2 text-lg">{title}</div>
        <div className="line-clamp-3 text-sm">{description}</div>
      </Col>
      <img className={clsx('m-0', className)} src={urlToImage} alt={title} />
    </Link>
  )
}
