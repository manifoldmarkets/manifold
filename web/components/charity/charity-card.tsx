import { StarIcon } from '@heroicons/react/solid'
import { sumBy } from 'lodash'
import Link from 'next/link'
import Image from 'next/image'
import { Charity } from 'common/charity'
import { useCharityTxns } from 'web/hooks/use-charity-txns'
import { manaToUSD } from '../../../common/util/format'
import { Row } from '../layout/row'
import { Col } from '../layout/col'

export function CharityCard(props: { charity: Charity; match?: number }) {
  const { charity, match } = props
  const { slug, photo, preview, id, tags } = charity

  const txns = useCharityTxns(id)
  const raised = sumBy(txns, (txn) => txn.amount)

  return (
    <Link href={`/charity/${slug}`} passHref>
      <div className="card card-compact transition:shadow flex-1 cursor-pointer border-2 bg-white hover:shadow-md">
        <Row className="mt-6 mb-2">
          {tags?.includes('Featured') && <FeaturedBadge />}
        </Row>
        <div className="px-8">
          <figure className="relative h-32">
            {photo ? (
              <Image src={photo} alt="" layout="fill" objectFit="contain" />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-slate-300 to-indigo-200" />
            )}
          </figure>
        </div>
        <div className="card-body">
          {/* <h3 className="card-title line-clamp-3">{name}</h3> */}
          <div className="line-clamp-4 text-sm">{preview}</div>
          {raised > 0 && (
            <>
              <Row className="text-primary mt-4 flex-1 items-end justify-center gap-6">
                <Col>
                  <span className="text-3xl">{formatUsd(raised)}</span>
                  <span>raised</span>
                </Col>
                {match && (
                  <Col className="text-gray-500">
                    <span className="text-xl">+{formatUsd(match)}</span>
                    <span className="">matched</span>
                  </Col>
                )}
              </Row>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

function formatUsd(mana: number) {
  return mana < 100 ? manaToUSD(mana) : '$' + Math.floor(mana / 100)
}

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-yellow-100 px-3 py-0.5 text-sm font-medium text-yellow-800">
      <StarIcon className="h-4 w-4" aria-hidden="true" /> Featured
    </span>
  )
}
