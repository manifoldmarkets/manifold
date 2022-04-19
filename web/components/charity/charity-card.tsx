import Link from 'next/link'
import { Row } from '../layout/row'

// TODO: type probably belongs elsewhere
export interface Charity {
  name: string
  slug: string
  website: string
  ein: string
  photo?: string
  blurb: string
  raised: number
}

interface Props {
  charity: Charity
}

export default function Card({ charity }: Props) {
  const { name, slug, photo, raised, blurb } = charity

  return (
    <Link href={`/charity/${slug}`} passHref>
      <div className="card image-full bg-base-100 glass cursor-pointer shadow-xl">
        <figure className="absolute h-full">
          {photo && <img src={photo} alt="" />}
        </figure>
        <div className="card-body">
          <h3 className="card-title line-clamp-3">{name}</h3>
          <div className="line-clamp-4 text-sm text-gray-100">{blurb}</div>
          <Row className="mt-4 items-end justify-center gap-1 text-green-300">
            <span className="text-3xl">${Math.floor(raised / 100)}</span>
            <span>raised</span>
          </Row>
        </div>
      </div>
    </Link>
  )
}
