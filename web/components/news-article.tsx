import { Col } from 'web/components/layout/col'

export const NewsArticle = (props: {
  title: string
  urlToImage: string
  url: string
  description: string
}) => {
  const { title, urlToImage, url, description } = props

  return (
    <Col className="relative w-full">
      <img
        className="border-ink-300 m-0 rounded-t-lg border object-contain "
        src={urlToImage}
        alt={title}
        height={200}
      />

      <a className={'absolute inset-0 z-10'} href={url} target="_blank" />
      <Col className="bg-canvas-0 border-ink-300 rounded-b-lg border border-t-0 p-2 hover:underline">
        <div className="line-clamp-2 text-ink-900 text-base">{title}</div>
        <div className="line-clamp-3 text-ink-600 text-xs">{description}</div>
      </Col>
    </Col>
  )
}
