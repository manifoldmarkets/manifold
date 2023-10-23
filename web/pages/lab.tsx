import { ExternalLinkIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Card } from 'web/components/widgets/card'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'

export default function LabsPage() {
  return (
    <Page trackPageView="lab page" className="px-2">
      <SEO title="Lab" description="experiments and mistakes" />
      <div className="flex justify-between">
        <Title>🧪 The Lab</Title>
        <div className="bg-primary-100 text-ink-700 mb-2 flex items-center self-start overflow-hidden rounded-lg">
          <LabLink href="/about">About</LabLink>
          {useAdmin() && <LabLink href="/admin">Admin</LabLink>}
          <LabLink href="/stats">Stats</LabLink>
          <LabLink href="https://manifoldmarkets.notion.site/About-4a1e35b5cedf43998161609eea887679">
            Notion
          </LabLink>
          <LabLink href="https://github.com/manifoldmarkets/manifold">
            Github
          </LabLink>
        </div>
      </div>
      <LabCard
        title="💌 Manifold.love"
        description="Coming soon — crowd source your long term matches"
        href="https://manifold.love"
      />
      <LabSection>
        <LabCard
          title="🎁 Loot Box"
          description="Invest in random questions"
          href="/lootbox"
        />
        <LabCard
          title="📂 Portfolios"
          description="Curate in a set of positions to invest in"
          href="/portfolio"
        />
        <LabCard
          title="💸 Manalinks"
          description={`Send mana via QR code`}
          href="/links"
        />
        <LabCard
          title="🎤 Mana-chan"
          description="Tweets from our anime spokesgirl"
          href="/manachan"
        />
        <LabCard
          title="💬 Discord bot"
          description="Create, trade, & share questions from Discord"
          href="/discord-bot"
        />
        <LabCard
          title="🎮 Twitch bot"
          description="Embed questions in your stream"
          href="/twitch"
        />
      </LabSection>
      <Subtitle>🪦 Graveyard</Subtitle>
      <div className="mb-4 italic">
        Dead and undead projects, haunting this page until we resurrect or
        exorcise them.
      </div>
      <LabSection>
        <LabCard
          title="🏆 CSPI/Salem tournament"
          description="Seperate site hosting special contest"
          href="https://salemcenter.manifold.markets/"
          target="_blank"
        />
        <LabCard
          title="✏ Posts"
          description="Go long on longform"
          href="/latestposts"
        />
        <LabCard
          title="🎱 Oddball"
          description="Guess the probability of events"
          href="https://oddball-pi.vercel.app/"
        />
        <LabCard
          title="⚔️ Versus"
          description="Create mana-battles between two ideas"
          href="/VersusBot?tab=questions"
        />
        <LabCard
          title="🎴 Manifold: The Gambling"
          description="Match each question to its creator"
          href="/cards"
        />
        <LabCard
          title="💰 Mana auction"
          description={`A dollar auction but for ${formatMoney(10000)}`}
          href="/mana-auction"
        />
        <LabCard
          title="👀 Classified Ads"
          description="An old version of question boosts that let you advertise anything. View ads for mana!"
          href="/ad"
        />
        <LabCard title="🐮 Moolinda" description="???" href="/cowp" />
      </LabSection>
    </Page>
  )
}

const LabLink = (props: { href: string; children: React.ReactNode }) => (
  <Link
    className="hover:bg-primary-300 px-3 py-2 transition-colors"
    href={props.href}
  >
    {props.children}
  </Link>
)

export const LabCard = (props: {
  title: string
  description?: string
  href: string
  onClick?: () => void
  target?: string
}) => {
  const { title, description, href, onClick, target } = props

  return (
    <Link href={href} onClick={onClick} target={target} className="mb-4 block">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          {target && (
            <ExternalLinkIcon className="ml-auto inline-block h-4 w-4" />
          )}
        </div>
        {description && <p className="text-ink-600">{description}</p>}
      </Card>
    </Link>
  )
}

export const LabSection = (props: { children: React.ReactNode }) => (
  <Masonry
    breakpointCols={{ default: 2, 768: 1 }}
    className="-ml-4 flex w-auto"
    columnClassName="pl-4 bg-clip-padding"
  >
    {props.children}
  </Masonry>
)
