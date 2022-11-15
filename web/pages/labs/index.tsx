import { CHALLENGES_ENABLED } from 'common/challenge'
import { DOMAIN } from 'common/envs/constants'
import Masonry from 'react-masonry-css'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SiteLink } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { getNativePlatform } from 'web/lib/native/is-native'

export default function LabsPage() {
  const { isNative, platform } = getNativePlatform()
  return (
    <Page>
      <SEO
        title="Manifold labs"
        description="Cool experimental features for you to check out!"
        url="/labs"
      />
      <Col className="px-4">
        <Title className="sm:!mt-0" text="🧪 Manifold Labs" />

        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {!isNative ||
            (isNative && platform !== 'ios' && (
              <LabCard
                title="🫀 Charity"
                description="Turn your Ṁ earnings into real donations to causes you care about"
                href="/charity"
              />
            ))}

          {CHALLENGES_ENABLED && (
            <LabCard
              title="💥 Challenges"
              description="One-on-one bets between friends"
              href="/challenges"
            />
          )}

          <LabCard
            title="💸 Manalinks"
            description="Send Ṁ to anyone"
            href="/links"
          />

          <LabCard
            title="💌 Dating"
            description="Browse dating profiles and bet on relationships"
            href="/date-docs"
          />

          <LabCard
            title="📈 Stats"
            description="See how Manifold is doing"
            href="/stats"
          />

          <LabCard
            title="⚡ Live feed"
            description="See trades and comments in real time"
            href="/live"
          />

          <LabCard
            title="🔥 Swipe"
            description="High frequency trading tool"
            href="/swipe"
          />

          <LabCard
            title="🇺🇸 2022 US Midterm Elections"
            description="Manifold's midterm forecast"
            href="/midterms"
          />

          <LabCard
            title="🎲 Magic the Guessering"
            description="Match MTG card names to their art"
            href={`https://${DOMAIN}/mtg/index.html`}
          />

          <LabCard title="🐮 Cowp" description="???" href="/cowp" />
        </Masonry>
      </Col>
    </Page>
  )
}

const LabCard = (props: {
  title: string
  description: string
  href: string
}) => {
  const { title, description, href } = props
  return (
    <SiteLink
      href={href}
      className="group mb-4 flex flex-col gap-2 rounded-lg bg-white p-4 shadow-md transition-shadow duration-200 hover:no-underline hover:shadow-lg"
    >
      <h3 className="text-lg font-semibold group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2">
        {title}
      </h3>
      <p className="text-gray-600">{description}</p>
    </SiteLink>
  )
}
