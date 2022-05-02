import { StarIcon } from '@heroicons/react/solid'
import _ from 'lodash'
import Link from 'next/link'
import { Charity } from '../../../common/charity'
import { useCharityTxns } from '../../hooks/use-charity-txns'
import { Row } from '../layout/row'

export function CharityCard(props: { charity: Charity }) {
  const { name, slug, photo, preview, id, tags } = props.charity

  const txns = useCharityTxns(id)
  const raised = _.sumBy(txns, (txn) => txn.amount)

  return (
    <Link href={`/charity/${slug}`} passHref>
      <div className="card card-compact transition:shadow flex-1 cursor-pointer border-2 bg-white hover:shadow-md">
        <Row className="mt-6">
          {tags?.includes('Featured') && <FeaturedBadge />}
        </Row>

        <figure className="h-32 px-4 pt-4">
          {photo ? (
            <img className="h-full w-full object-contain" src={photo} alt="" />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-slate-300 to-indigo-200" />
          )}
        </figure>
        <div className="card-body">
          {/* <h3 className="card-title line-clamp-3">{name}</h3> */}
          <div className="line-clamp-4 text-sm">{preview}</div>
          {raised > 0 && (
            <Row className="text-primary mt-4 flex-1 items-end justify-center gap-2">
              <span className="text-3xl">
                ${Math.floor((raised ?? 0) / 100)}
              </span>
              <span>raised</span>
            </Row>
          )}
        </div>
      </div>
    </Link>
  )
}

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-yellow-100 px-3 py-0.5 text-sm font-medium text-yellow-800">
      <StarIcon className="h-4 w-4" aria-hidden="true" /> Featured
    </span>
  )
}
