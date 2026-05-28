import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, DocumentTextIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesMarketPoliciesPage() {
  return (
    <Page trackPageView="community guidelines market policies page" className="!col-span-7">
      <SEO title="Community Guidelines — Market Policies" description="Market states, ranking, subsidization, unlisting criteria, third-party platform rules, and personal markets." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/community-guidelines" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-500">
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="flex items-center gap-2 text-primary-500">
          <DocumentTextIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Market Policies</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          How markets are classified, when they lose ranking or subsidization, and what can get a market unlisted or deleted.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="market-states" className="text-xl font-semibold text-ink-1000">Market states</h2>
          <p className="mt-3 text-ink-700">Every market has two independently toggleable states: <a href="#ranked" className="text-primary-500 underline">Ranked</a> and <a href="#unlisted-na-deleted" className="text-primary-500 underline">Unlisted</a>. Admins and moderators can change either of these.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="ranked" className="text-xl font-semibold text-ink-1000">Ranked</h2>
          <p className="mt-3 text-ink-700">All markets are ranked by default, meaning they count toward <Link href="/community-guidelines/leagues" className="text-primary-500 underline">Leagues</Link>.</p>
          <p className="mt-3 text-ink-700">A market may be set to unranked if:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>It's unlisted — unlisted markets are always unranked, regardless of the toggle</li>
            <li>It's self-referential</li>
            <li>It's about the results of Leagues</li>
            <li>It resolves to something purely random or gambling-like (e.g. "will this coin flip be heads?")</li>
            <li>Resolution criteria can only be known by the creator or their immediate friends (e.g. "will I eat pizza tonight?") — unless the creator opts not to trade, provides no insider advantage to friends, and outlines concrete verifiable evidence at market creation</li>
            <li>It isn't predicting anything</li>
            <li>It can never be resolved or could only ever resolve one way</li>
          </ul>
          <p className="mt-3 text-sm text-ink-600">If you're not sure why your market is unranked, ask in <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a>.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="subsidized" className="text-xl font-semibold text-ink-1000">Subsidized</h2>
          <p className="mt-3 text-ink-700">Creators receive 5 mana per unique trader for the first 50 traders, then 1 mana up to a cap of 10,000. Markets also receive a 20 mana liquidity subsidy from the house for each of the first 50 traders, then 5 mana to the same cap.</p>
          <p className="mt-3 text-ink-700">A market may be unsubsidized if:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>It's unlisted — unlisted markets are never subsidized by default</li>
            <li>It's self-referential</li>
            <li>It resolves to something purely random or gambling-like</li>
            <li>It's spam or extremely low quality (e.g. "will the sun explode tomorrow?")</li>
            <li>It can never be resolved or could only ever resolve one way</li>
            <li>It's an exact or near-exact duplicate of an existing market</li>
            <li>It falls under the unlisting criteria below but isn't severe enough to act on</li>
          </ul>
          <p className="mt-3 text-sm text-ink-600">Note: unsubsidization may be applied after some initial bonuses have already been received and is not retroactive. Markets that technically qualify but seem genuinely valuable may still be left subsidized.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="unlisted-na-deleted" className="text-xl font-semibold text-ink-1000">Markets that may be unlisted, N/A'd, or deleted</h2>
          <p className="mt-3 text-ink-700">We default to unlisting — this makes a market only accessible via direct URL. Depending on severity, markets may be N/A'd or deleted instead.</p>
          <p className="mt-3 text-ink-700">The following may trigger action:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Abandoned markets with vague criteria</li>
            <li>Sexually graphic content or significant violence</li>
            <li>Content that encourages or could directly facilitate terrorism, abuse, or violence</li>
            <li>Hateful content discriminating based on race, gender, sex, or disability — reviewed by admin on a case-by-case basis</li>
            <li>Titles containing trending spoilers</li>
            <li>Markets that resolve to something purely random or gambling-like</li>
            <li>Self-referential markets (e.g. "will this market get more upvotes than downvotes?")</li>
            <li>Low-quality non-predictive markets</li>
            <li>Markets designed to harvest or redistribute Manifold bonuses</li>
            <li>Markets designed to defraud users — these will typically be N/A'd retroactively rather than unlisted</li>
            <li>Markets that incentivize indiscriminate trading, commenting, or posting — including any pattern that creates significant server costs</li>
            <li>Content revealing or incentivizing leaking of users' private information (doxxing)</li>
            <li>Content that is illegal under US law or incentivizes criminal acts</li>
            <li>Sexual content involving minors</li>
            <li>Sexual exploitation, blackmail, or non-consensual intimate content</li>
            <li>Spam</li>
            <li>Media depicting self-harm or suicide</li>
            <li>Markets designed to exploit the Manifold codebase or abuse bugs</li>
            <li>Markets that incentivize violating another platform's terms of service</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="third-party-platforms" className="text-xl font-semibold text-ink-1000">A note on third-party platforms</h2>
          <p className="mt-3 text-ink-700">Copying Metaculus tournament questions while the community prediction is hidden violates their terms of service and undermines their tournaments. Don't do it. General questions inspired by external forecasting topics are fine — for example, "will Twitter have a data breach?" is allowed.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="personal-markets" className="text-xl font-semibold text-ink-1000">Personal markets</h2>
          <p className="mt-3 text-ink-700">Personal goal markets are a use case we actively want to support.</p>
          <p className="mt-3 text-ink-700">Personal markets follow the same ranking rules as any other market. They are not automatically unranked — a well-run personal market that doesn't fall under the unranking criteria above should be ranked normally.</p>
          <p className="mt-3 text-ink-700">The exception is when the creator is participating in the market themselves, which creates an inherent insider advantage. In those cases the market will typically be unranked. This can be avoided if the creator opts not to trade, provides no insider advantage to others, and outlines concrete verifiable evidence at market creation.</p>
          <p className="mt-3 text-ink-700">Creators of personal markets have the right to resolve N/A at any time. We strongly encourage stating this upfront in your market description — something like "I reserve the right to resolve this N/A at any point" helps set expectations for traders.</p>
          <p className="mt-3 text-ink-700">A few other things to know:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Some personal markets involve others or private matters that make clean resolution genuinely difficult. N/A is always available in those cases.</li>
            <li>Manifold can't force a creator to resolve a market if they leave the platform or go inactive.</li>
          </ul>
        </div>

        <SectionNav currentHref="/community-guidelines/market-policies" />
      </Col>
    </Page>
  )
}
