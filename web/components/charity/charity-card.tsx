import { StarIcon } from '@heroicons/react/solid'
import { sumBy } from 'lodash'
import Link from 'next/link'
import Image from 'next/legacy/image'
import { Charity } from 'common/charity'
import { useCharityTxns } from 'web/hooks/use-charity-txns'
import { formatMoneyUSD } from 'common/util/format'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Card } from '../widgets/card'

export function CharityCard(props: { charity: Charity; match?: number }) {
  const { charity } = props
  const { slug, photo, preview, id, tags } = charity

  const txns = useCharityTxns(id)
  const raised = sumBy(txns, (txn) => txn.amount)

  return (
    <Link href={`/charity/${slug}`} className="flex-1">
      <Card className="!rounded-2xl">
        <Row className="mt-6 mb-2">{tags?.includes('New') && <NewBadge />}</Row>
        <div className="px-8">
          <figure className="relative h-32">
            {photo ? (
              <Image src={photo} alt="" layout="fill" objectFit="contain" />
            ) : (
              <div className="to-primary-200 from-ink-300 h-full w-full bg-gradient-to-r" />
            )}
          </figure>
        </div>
        <Col className="p-8">
          <div className="line-clamp-4 text-sm">{preview}</div>
          {raised > 0 && (
            <>
              <Row className="text-ink-900 mt-4 flex-1 items-end justify-center gap-6">
                <Row className="items-baseline gap-1">
                  <span className="text-3xl font-semibold">
                    {formatMoneyUSD(raised / 100)}
                  </span>
                  raised
                </Row>
                {/* {match && (
                <Col className="text-ink-500">
                  <span className="text-xl">+{formatUsd(match)}</span>
                  <span className="">match</span>
                </Col>
              )} */}
              </Row>
            </>
          )}
        </Col>
      </Card>
    </Link>
  )
}

function NewBadge() {
  return (
    <span className="text-primary-700 inline-flex items-center gap-1 bg-blue-100 px-3 py-0.5 text-sm font-medium">
      <StarIcon className="h-4 w-4" aria-hidden="true" /> New
    </span>
  )
}
