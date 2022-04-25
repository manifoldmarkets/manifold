import Link from 'next/link'
import { Charity } from '../../../common/charity'
import { Row } from '../layout/row'

export function CharityCard(props: { charity: Charity }) {
  const { name, slug, photo, raised, blurb } = props.charity

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
            <span className="text-3xl">${Math.floor((raised ?? 0) / 100)}</span>
            <span>raised</span>
          </Row>
        </div>
      </div>
    </Link>
  )
}
