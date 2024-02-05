import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import Welcome from 'web/components/onboarding/welcome'
import { Title } from 'web/components/widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { FeedTimeline } from 'web/components/feed-timeline'
import { api } from 'web/lib/firebase/api'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Headline } from 'common/news'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { WelcomeTopicSections } from 'web/components/home/welcome-topic-sections'
import { useNewUserMemberTopicsAndContracts } from 'web/hooks/use-group-supabase'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS } from 'common/util/time'

export async function getStaticProps() {
  const headlines = await api('headlines', {})
  return {
    props: {
      headlines,
      revalidate: 30 * 60, // 4 hours
    },
  }
}

export default function Home(props: { headlines: Headline[] }) {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  const user = useUser()
  const privateUser = usePrivateUser()
  useSaveReferral(user)

  const { headlines } = props
  const isMobile = useIsMobile()
  const memberTopicsWithContracts = useNewUserMemberTopicsAndContracts(user)
  const createdRecently = (user?.createdTime ?? 0) > Date.now() - DAY_MS
  return (
    <>
      <Welcome />
      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
        <HeadlineTabs headlines={headlines} />
        <Row className="mx-3 mb-2 items-center gap-2">
          <div className="flex md:hidden">
            {user ? (
              <ProfileSummary
                user={user}
                avatarSize={isMobile ? 'sm' : undefined}
              />
            ) : (
              <Spacer w={4} />
            )}
          </div>
          <Title className="!mb-0 hidden whitespace-nowrap md:flex">
            For You
          </Title>

          <DailyStats user={user} />
        </Row>
        {!user ? (
          <LoadingIndicator />
        ) : !createdRecently ? (
          isClient ? (
            <FeedTimeline user={user} privateUser={privateUser} />
          ) : null
        ) : !memberTopicsWithContracts ? (
          <LoadingIndicator />
        ) : (
          <>
            <WelcomeTopicSections
              memberTopicsWithContracts={memberTopicsWithContracts}
            />
            {isClient && <FeedTimeline user={user} privateUser={privateUser} />}
          </>
        )}
      </Page>
    </>
  )
}
