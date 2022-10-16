import { StarIcon } from '@heroicons/react/solid'
import { sumBy } from 'lodash'
import Link from 'next/link'
import Image from 'next/image'
import { Charity } from 'common/charity'
import { useCharityTxns } from 'web/hooks/use-charity-txns'
import { manaToUSD } from '../../../common/util/format'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Card } from '../widgets/card'

export function CharityCard(props: { charity: Charity; match?: number }) {
  const { charity } = props
  const { slug, photo, preview, id, tags } = charity

  const txns = useCharityTxns(id)
  const raised = sumBy(txns, (txn) => txn.amount)

  return (
    <Link href={`/charity/${slug}`}>
      <a className="flex-1">
        <Card className="!rounded-2xl">
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
          <Col className="p-8">
            <div className="line-clamp-4 text-sm">{preview}</div>
            {raised > 0 && (
              <>
                <Row className="mt-4 flex-1 items-end justify-center gap-6 text-gray-900">
                  <Row className="items-baseline gap-1">
                    <span className="text-3xl font-semibold">
                      {formatUsd(raised)}
                    </span>
                    raised
                  </Row>
                  {/* {match && (
                  <Col className="text-gray-500">
                    <span className="text-xl">+{formatUsd(match)}</span>
                    <span className="">match</span>
                  </Col>
                )} */}
                </Row>
              </>
            )}
          </Col>
        </Card>
      </a>
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
