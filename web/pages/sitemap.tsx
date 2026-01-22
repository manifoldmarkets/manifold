import { capitalize } from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'
import {
  CogIcon,
  UserCircleIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  StarIcon,
  SparklesIcon,
  GiftIcon,
  DesktopComputerIcon,
  DocumentTextIcon,
  CollectionIcon,
  LightningBoltIcon,
  ChipIcon,
  FlagIcon,
  ClipboardCheckIcon,
  InformationCircleIcon,
  DocumentDuplicateIcon,
  QuestionMarkCircleIcon,
  PresentationChartLineIcon,
  CodeIcon,
  GlobeAltIcon,
  HeartIcon,
  ExternalLinkIcon,
  MapIcon,
} from '@heroicons/react/outline'
import { TRADE_TERM } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Socials } from 'web/components/socials'

export default function SitemapPage() {
  const { isNative, platform } = getNativePlatform()
  const user = useUser()

  return (
    <Page trackPageView={'sitemap page'}>
      <SEO
        title="Sitemap"
        description={`Manifold is a social prediction game. ${capitalize(
          TRADE_TERM
        )} on news, politics, tech, & AI with play money. Or create your own prediction market.`}
      />

      <Col className="mx-auto w-full max-w-4xl px-4 pb-12 pt-4">
        {/* Header */}
        <div className="mb-8">
          <ManifoldLogo className="mb-4 flex sm:hidden" />
          <Row className="items-center gap-3">
            <div className="bg-primary-100 dark:bg-primary-900/50 rounded-xl p-2.5">
              <MapIcon className="text-primary-600 dark:text-primary-400 h-6 w-6" />
            </div>
            <div>
              <h1 className="text-ink-900 text-2xl font-bold sm:text-3xl">
                Sitemap
              </h1>
              <p className="text-ink-500 mt-0.5 text-sm">
                Navigate to any part of Manifold
              </p>
            </div>
          </Row>
        </div>

        {/* Socials Section */}
        <Socials className="mb-8" />

        {/* Site Pages Section */}
        <SitemapSection
          title="Site Pages"
          subtitle="Core features and tools"
          className="mb-8"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SitemapLink
              title="Notification settings"
              description="Manage your alerts and emails"
              href="/notifications?tab=settings"
              icon={CogIcon}
            />
            {user && (
              <SitemapLink
                title="Edit profile"
                description="Customize your public profile"
                href={`/${user?.username ?? ''}?tab=edit+profile`}
                icon={UserCircleIcon}
              />
            )}
            {user && (!isNative || (isNative && platform !== 'ios')) && (
              <SitemapLink
                title="Get mana"
                description="Purchase mana to trade with"
                href="/add-funds"
                icon={CurrencyDollarIcon}
              />
            )}
            {user && (
              <SitemapLink
                title="Refer a friend"
                description="Earn rewards for referrals"
                href="/referrals"
                icon={UserGroupIcon}
              />
            )}
            <SitemapLink
              title="Leagues"
              description="Compete in seasonal leagues"
              href="/leagues"
              icon={StarIcon}
            />
            <SitemapLink
              title="Predictle"
              description="Daily prediction game"
              href="/predictle"
              icon={SparklesIcon}
            />
            <SitemapLink
              title="Leaderboards"
              description="Top traders and creators"
              href="/leaderboards"
              icon={StarIcon}
            />
            <SitemapLink
              title="Charity Giveaway"
              description="Donate winnings to charity"
              href="/charity"
              icon={GiftIcon}
            />
            <SitemapLink
              title="TV"
              description="Live prediction streams"
              href="/tv"
              icon={DesktopComputerIcon}
            />
            <SitemapLink
              title="Changelog"
              description="Latest updates and features"
              href="/posts?filter=changelog"
              icon={DocumentTextIcon}
            />
            <SitemapLink
              title="Dashboards"
              description="Curated market collections"
              href="/dashboard"
              icon={CollectionIcon}
            />
            <SitemapLink
              title="Site activity"
              description="Real-time market activity"
              href="/live"
              icon={LightningBoltIcon}
            />
            <SitemapLink
              title="AI"
              description="AI prediction markets"
              href="/ai"
              icon={ChipIcon}
            />
            <SitemapLink
              title="US Elections"
              description="Political prediction markets"
              href="/election"
              icon={FlagIcon}
            />
            <SitemapLink
              title="Todo"
              description="Track your tasks"
              href="/todo"
              icon={ClipboardCheckIcon}
            />
          </div>
        </SitemapSection>

        {/* Information Resources Section */}
        <SitemapSection
          title="Information & Resources"
          subtitle="Learn how Manifold works"
          className="mb-8"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SitemapLink
              title="About Manifold"
              description="Learn what we're all about"
              href="/about"
              icon={InformationCircleIcon}
            />
            <SitemapLink
              title="Community guidelines"
              description="Rules and expectations"
              href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
              external
              icon={DocumentDuplicateIcon}
            />
            <SitemapLink
              title="FAQ"
              description="Frequently asked questions"
              href="https://docs.manifold.markets/faq"
              external
              icon={QuestionMarkCircleIcon}
            />
            <SitemapLink
              title="Calibration & track record"
              description="How accurate are we?"
              href="/calibration"
              icon={PresentationChartLineIcon}
            />
            <SitemapLink
              title="API documentation"
              description="Build with our API"
              href="https://docs.manifold.markets/api"
              external
              icon={CodeIcon}
            />
            <SitemapLink
              title="Press kit"
              description="Media resources and assets"
              href="/press"
              icon={DocumentTextIcon}
            />
          </div>
        </SitemapSection>

        {/* External Sites Section */}
        <SitemapSection
          title="External Sites"
          subtitle="Related projects and communities"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SitemapLink
              title="GitHub"
              description="View our open source code"
              href="https://github.com/manifoldmarkets/manifold"
              external
              icon={CodeIcon}
            />
            <SitemapLink
              title="Manifest"
              description="Our annual conference"
              href="https://www.manifest.is/"
              external
              icon={GlobeAltIcon}
            />
            <SitemapLink
              title="Bet on Love"
              description="Reality TV dating show"
              href="https://www.youtube.com/watch?v=mEF0S1qOsFI"
              external
              icon={HeartIcon}
            />
            <SitemapLink
              title="Manifold.love"
              description="Dating prediction markets"
              href="https://manifold.love"
              external
              icon={HeartIcon}
            />
            <SitemapLink
              title="Manifund"
              description="Impact certificates platform"
              href="https://manifund.org/"
              external
              icon={GiftIcon}
            />
            <SitemapLink
              title="Calibration City"
              description="Test your calibration skills"
              href="https://calibration.city/"
              external
              icon={PresentationChartLineIcon}
            />
          </div>
        </SitemapSection>
      </Col>
    </Page>
  )
}

function SitemapSection(props: {
  title: string
  subtitle: string
  children: React.ReactNode
  className?: string
}) {
  const { title, subtitle, children, className } = props
  return (
    <section className={className}>
      <div className="mb-4">
        <h2 className="text-ink-900 text-lg font-semibold">{title}</h2>
        <p className="text-ink-500 text-sm">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function SitemapLink(props: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
}) {
  const { title, description, href, icon: Icon, external } = props

  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={clsx(
        'bg-canvas-0 border-ink-200 group relative flex items-start gap-3 rounded-xl border p-4 shadow-sm transition-all',
        'hover:border-primary-300 hover:bg-primary-50/50 dark:hover:bg-primary-950/20 hover:shadow-md',
        'dark:border-ink-300'
      )}
    >
      <div className="bg-ink-100 group-hover:bg-primary-100 dark:bg-ink-800 dark:group-hover:bg-primary-900/50 flex-shrink-0 rounded-lg p-2 transition-colors">
        <Icon className="text-ink-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 h-5 w-5 transition-colors" />
      </div>
      <div className="min-w-0 flex-1">
        <Row className="items-center gap-1.5">
          <span className="text-ink-900 group-hover:text-primary-700 dark:group-hover:text-primary-400 font-medium transition-colors">
            {title}
          </span>
          {external && (
            <ExternalLinkIcon className="text-ink-400 h-3.5 w-3.5 flex-shrink-0" />
          )}
        </Row>
        <p className="text-ink-500 mt-0.5 text-sm leading-snug">{description}</p>
      </div>
    </Link>
  )
}
