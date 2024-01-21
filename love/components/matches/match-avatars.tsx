import { Row } from 'web/components/layout/row'
import { HeartIcon } from '@heroicons/react/solid'
import { Lover } from 'common/love/lover'
import Image from 'next/image'
import { Col } from 'web/components/layout/col'
import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

export function MatchAvatars(props: {
  profileLover: Lover
  matchedLover: Lover
  className?: string
}) {
  const { profileLover, matchedLover, className } = props

  return (
    <Row className={clsx(className, 'mx-auto items-center gap-1')}>
      {profileLover.pinned_url ? (
        <Image
          src={profileLover.pinned_url}
          // You must set these so we don't pay an extra $1k/month to vercel
          width={100}
          height={100}
          alt={profileLover.user.username}
          className="h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <Col className="bg-ink-300 h-full w-full items-center justify-center">
          <UserIcon className="h-16 w-16" />
        </Col>
      )}

      <HeartIcon className="text-ink-300 h-6 w-6" />
      {matchedLover.pinned_url ? (
        <Image
          src={matchedLover.pinned_url}
          // You must set these so we don't pay an extra $1k/month to vercel
          width={100}
          height={100}
          alt={matchedLover.user.username}
          className="h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <Col className="bg-ink-300 h-full w-full items-center justify-center">
          <UserIcon className="h-16 w-16" />
        </Col>
      )}
    </Row>
  )
}
