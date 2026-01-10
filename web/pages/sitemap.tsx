import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { LabCard } from './lab'
import { Socials } from 'web/components/socials'

export default function AboutPage() {
  const { isNative, platform } = getNativePlatform()
  const user = useUser()

  return (
    <Page trackPageView={'about page'}>
      <SEO
        title="Sitemap"
        description={`Manifold is a social prediction game. ${capitalize(
          TRADE_TERM
        )} on news, politics, tech, & AI with play money. Or create your own prediction market.`}
      />

      <Col className="p-4">
        <Title className="hidden sm:flex">Sitemap</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />
        <div className="mb-5">
          <Socials />
        </div>

        <div className="mb-3">
          <h2 className={'text-ink-600  text-xl'}>Site pages</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            <LabCard
              title="⚙️ Notification & email settings"
              href="/notifications?tab=settings"
            />
            {user && (
              <LabCard
                title="✏️ Edit profile"
                href={`/${user?.username ?? ''}?tab=edit+profile`}
              />
            )}
            {user && (!isNative || (isNative && platform !== 'ios')) && (
              <LabCard title="💰 Get mana" href="/add-funds" />
            )}
            {user && <LabCard title="🤗‍ Refer a friend" href="/referrals" />}

            <LabCard title="🏁 Leagues" href="/leagues" />
            <LabCard title="🔮 Predictle" href="/predictle" />
            <LabCard title="🏆 Leaderboards" href="/leaderboards" />

            <LabCard title="🎟️ Charity Giveaway" href="/charity" />
           

            <LabCard title="📺 TV" href="/tv" />
            <LabCard title="️✨ Changelog" href="/posts?filter=changelog" />
            <LabCard title="️🔖 Dashboards" href="/dashboard" />
            <LabCard title="⚡️ Site activity" href="/live" />
            <LabCard title="🤖 AI" href="/ai" />
            <LabCard title="🇺🇸 US elections" href="/election" />
            <LabCard title="✅ Todo" href="/todo" />
            {/* <LabCard title="️🧪 Lab" href="/lab" /> */}
          </div>
        </div>
        <div className="mb-3">
          <h2 className={'text-ink-600 text-xl'}>Informative resources</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            <LabCard title="ℹ️ About page" href="/about" />
            <LabCard
              title="📜 Community guidelines"
              href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
              target="_blank"
            />
            <LabCard
              title="📚 FAQ"
              href="https://docs.manifold.markets/faq"
              target="_blank"
            />
            <LabCard
              title="👨‍⚖️ Sweepstakes rules"
              href="/sweepstakes-rules"
              target="_blank"
            />
            <LabCard
              title="🎯 Calibration & track record"
              href="/calibration"
            />
            <LabCard
              title="🦋 Changelog"
              href="https://manifoldmarkets.notion.site/Changelog-da5b4fe95872484f8fa4ee5cc71806d8"
              target="_blank"
            />
            <LabCard
              title="📠 API docs"
              href="https://docs.manifold.markets/api"
              target="_blank"
            />
            <LabCard title="📰 Press kit" href="/press" />
          </div>
        </div>
        <div>
          <h2 className={'text-ink-600 text-xl'}>External sites</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            {' '}
            <LabCard
              title="🧑‍💻 Github"
              href="https://github.com/manifoldmarkets/manifold"
              target="_blank"
            />
            <LabCard
              title="️🎊 Manifest"
              href="https://www.manifest.is/"
              target="_blank"
            />{' '}
            <LabCard
              title="️💘 Bet on Love"
              href="https://www.youtube.com/watch?v=mEF0S1qOsFI"
              target="_blank"
            />
            <LabCard
              title="❤️ Manifold.love"
              href="https://manifold.love"
              target="_blank"
            />
            <LabCard
              title="🦊 Manifund"
              href="https://manifund.org/"
              target="_blank"
            />
            <LabCard
              title="📈 Calibration City"
              href="https://calibration.city/"
              target="_blank"
            />
          </div>
        </div>
      </Col>
    </Page>
  )
}
