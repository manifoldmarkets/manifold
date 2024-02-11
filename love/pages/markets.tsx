import { capitalize } from 'lodash'
import Link from 'next/link'
import { ExternalLinkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { LovePage } from 'love/components/love-page'
import { LoveMarketCarousel } from 'love/components/widgets/markets-display'
import { Col } from 'web/components/layout/col'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { convertGender, Gender } from 'love/components/gender-icon'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { linkClass } from 'web/components/widgets/site-link'
import { contractPath } from 'common/contract'
import ProfileCarousel from 'love/components/profile-carousel'
import { Subtitle } from 'love/components/widgets/lover-subtitle'
import { useUser } from 'web/hooks/use-user'
import { CreateYourMarketButton } from 'love/components/widgets/create-your-market-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export default function MarketsPage() {
  const { data } = useAPIGetter('get-love-markets', {})
  const user = useUser()

  return (
    <LovePage trackPageView="love markets" className={'p-2 sm:pt-0'}>
      <Col className="gap-4">
        <Row className="my-2 items-center justify-between">
          <Title className="!mb-0">Markets</Title>

          {user &&
            data &&
            data.creatorLovers.every((l) => l.user_id !== user.id) && (
              <CreateYourMarketButton className="self-end" />
            )}
        </Row>
        {!data && <LoadingIndicator />}
        {data &&
          data.contracts.map((contract) => {
            const loverUserIds = new Set(
              contract.answers.map((a) => a.loverUserId)
            )
            const lovers = data.lovers.filter((l) =>
              loverUserIds.has(l.user_id)
            )
            const profileLover = data.creatorLovers.find(
              (l) => l.user_id === contract.creatorId
            )
            if (!profileLover) return null
            const { user, gender, city } = profileLover
            return (
              <Col
                key={contract.id}
                className="bg-primary-100 dark:bg-canvas-0 border-ink-50 w-full items-start gap-4 rounded-lg py-4"
              >
                <Row className="w-full justify-between gap-2 px-4">
                  <Col className="gap-1">
                    <Link
                      href={`/${user.username}`}
                      className={clsx(linkClass, 'flex-shrink-0')}
                    >
                      <span className="break-words text-xl font-semibold">
                        {user.name}
                      </span>
                    </Link>
                    <Row className="gap-1 text-sm">
                      {city} • {capitalize(convertGender(gender as Gender))}
                    </Row>
                  </Col>
                  <Link
                    className={clsx(linkClass, 'text-ink-500')}
                    href={contractPath(contract)}
                  >
                    <Row className="items-center gap-1 whitespace-nowrap">
                      <div>See market</div>{' '}
                      <ExternalLinkIcon className="h-5 w-5" />
                    </Row>
                  </Link>
                </Row>
                <Col className="w-full gap-2">
                  <ProfileCarousel lover={profileLover} hideAdminButton />

                  <Subtitle className="px-4 pt-2">Matches</Subtitle>

                  <LoveMarketCarousel
                    contract={contract}
                    lovers={lovers}
                    mutuallyMessagedUserIds={
                      data.creatorMutuallyMessagedUserIds[contract.creatorId]
                    }
                    profileLover={profileLover}
                  />
                </Col>
              </Col>
            )
          })}
      </Col>
    </LovePage>
  )
}
