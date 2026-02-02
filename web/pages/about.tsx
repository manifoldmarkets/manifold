import { TRADE_TERM } from 'common/envs/constants'
import {
  ChartBarIcon,
  LightBulbIcon,
  ShieldCheckIcon,
} from '@heroicons/react/outline'
import { capitalize } from 'lodash'
import { AboutManifold } from 'web/components/about-manifold'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { LabCard } from './lab'
import { Socials } from 'web/components/socials'

export default function AboutPage() {
  return (
    <Page trackPageView={'about page'} className="!col-span-7">
      <SEO
        title="About"
        description={`Manifold is a prediction market platform. Users place ${TRADE_TERM}s on an upcoming event which creates a probability of how likely it will happen. ${capitalize(
          TRADE_TERM
        )} on current events, politics, tech, & AI with play money. Or create your own prediction market for others to trade on!`}
      />

      <Col className="mx-auto w-full max-w-3xl p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />
        <Col className="gap-4">
          <div>
            <AboutManifold className="text-lg" />
          </div>

          <ExplainerPanel className={'max-w-full'} showWhatIsManifold={false} />

          <div>
            <h2 className={'text-ink-600 mb-2 text-xl'}>Intro video</h2>
            <div className="mb-1 text-lg">
              Everything you need to know in 7 minutes presented by an animated
              corgi:
            </div>
            <iframe
              src="https://www.youtube.com/embed/DB5TfX7eaVY?start=9"
              className="mb-4 h-80 w-full max-w-2xl"
            ></iframe>
          </div>

          <div>
            <h2 className={'text-ink-600 mb-4 text-xl'}>Our mission</h2>
            <Col className="gap-3">
              <MissionItem
                icon={<ChartBarIcon className="h-5 w-5" />}
                text="Provide the most accurate, real-time predictions on any event."
              />
              <MissionItem
                icon={<ShieldCheckIcon className="h-5 w-5" />}
                text="Combat misleading news by incentivising traders to be fast and correct."
              />
              <MissionItem
                icon={<LightBulbIcon className="h-5 w-5" />}
                text="Help people make more informed decisions by improving their model of the future."
              />
            </Col>
          </div>

          <Socials className="my-2" />

          <div>
            <h2 className={'text-ink-600 mb-2 text-xl'}>
              Still have questions?
            </h2>

            <div className="mt-4 grid gap-x-2 md:grid-cols-3">
              <LabCard
                title="FAQ"
                href="https://docs.manifold.markets/faq"
                target="_blank"
                description="Answers to common questions"
              />

              <LabCard
                title="Community guidelines"
                href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
                target="_blank"
                description="Rules, norms, and expectations"
              />

              <LabCard
                title="Sitemap"
                href="/sitemap"
                description="I can't find something"
              />
            </div>
            <div className="text-lg">
              If you need help with a specific market please tag @mods in a
              comment for help!
            </div>
          </div>
        </Col>
      </Col>
    </Page>
  )
}

function MissionItem(props: { icon: React.ReactNode; text: string }) {
  const { icon, text } = props
  return (
    <Row className="items-start gap-3">
      <div className="text-primary-600 mt-0.5 flex-shrink-0">{icon}</div>
      <span className="text-ink-800 text-lg">{text}</span>
    </Row>
  )
}
