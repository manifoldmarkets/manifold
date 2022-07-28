import Link from 'next/link'
import Image from 'next/image'

import { Grantee } from '.'
import { Row } from 'web/components/layout/row'
import { sumBy } from 'lodash'

export default function GranteeCard(props: { grantee: Grantee }) {
  const { grantee } = props
  const { slug, photo, preview } = grantee

  // sumBy grantee.grantsReceived amount
  const raised = sumBy(grantee.grantsReceived, (grant) => grant.amount)

  return (
    <Link href={`/grants/${slug}`} passHref>
      <div className="card card-compact transition:shadow flex-1 cursor-pointer border-2 bg-white hover:shadow-md">
        <div className="px-8">
          <figure className="relative h-32">
            {photo ? (
              <Image src={photo} alt="" layout="fill" objectFit="contain" />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-slate-300 to-indigo-200">
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-light">
                  {grantee.name}
                </div>
              </div>
            )}
          </figure>
        </div>
        <div className="card-body">
          <div className="line-clamp-4 text-sm">{preview}</div>
          {raised > 0 && (
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
          )}
        </div>
      </div>
    </Link>
  )
}

function formatUsd(usd: number) {
  return `$${usd}`
}
