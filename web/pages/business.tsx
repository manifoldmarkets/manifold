import { useState } from 'react'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { Card } from 'web/components/widgets/card'
import { Title } from 'web/components/widgets/title'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import Link from 'next/link'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { CalibrationChart } from 'web/pages/calibration'
import { SizedContainer } from 'web/components/sized-container'

export const getStaticProps = async () => {
  const db = await initSupabaseAdmin()

  try {
    const result = await db
      .from('platform_calibration')
      .select('*')
      .order('created_time', { ascending: false })
      .limit(1)

    const { points, score, n } = result.data?.[0]?.data as any

    return {
      props: {
        points,
        score,
        n,
      },
      revalidate: 60 * 60,
    }
  } catch (err) {
    console.error(err)
    return {
      props: {
        points: [],
        score: 0,
        n: 0,
      },
      revalidate: 60,
    }
  }
}

function FAQItem({
  question,
  answer,
}: {
  question: string
  answer: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border-ink-200 border-b py-4">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-ink-900 text-lg font-medium">{question}</span>
        {isOpen ? (
          <ChevronUpIcon className="text-ink-500 h-5 w-5" />
        ) : (
          <ChevronDownIcon className="text-ink-500 h-5 w-5" />
        )}
      </button>
      {isOpen && <div className="text-ink-700 mt-2">{answer}</div>}
    </div>
  )
}

export default function BusinessPage(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
}) {
  const { points } = props

  return (
    <Page trackPageView="business page">
      <SEO
        title="Manifold for Business"
        description="Calibrated forecasts on the questions that matter to your business."
      />

      <Col className="mx-auto w-full max-w-5xl gap-16 px-4 py-12 sm:px-6 lg:px-8">
        {/* Section 1: Hero */}
        <Col className="items-center gap-6 text-center">
          <h1 className="text-ink-900 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Calibrated forecasts on the questions that matter to your business.
          </h1>
          <p className="text-ink-700 max-w-3xl text-lg sm:text-xl">
            Manifold is a calibrated forecasting platform powered by prediction
            markets. Five thousand active traders set odds on real-world
            questions, and across 150,000 resolved markets they've landed at a
            Brier score of 0.1725 — better than most polls and many futures
            markets. Bring us a question you can't get a clean answer to
            anywhere else, and we'll put it in front of them.
          </p>
          <Row className="gap-4">
            <Link href="mailto:info@manifold.markets">
              <Button size="xl" color="indigo">
                Email us
              </Button>
            </Link>
            <Link href="https://calendly.com/manifoldmarkets" target="_blank">
              <Button size="xl" color="gray-outline">
                Book a call
              </Button>
            </Link>
          </Row>

          <Row className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { name: 'Boost', price: '$100' },
              { name: 'Stake', price: '$750' },
              { name: 'Commission', price: '$2,500' },
              { name: 'Custom', price: 'Contact us' },
            ].map((tier) => (
              <a
                href={`#${tier.name.toLowerCase()}`}
                key={tier.name}
                className="border-ink-200 bg-canvas-0 hover:bg-ink-50 flex flex-col items-center justify-center rounded-lg border p-4 transition-colors"
              >
                <span className="text-ink-500 text-sm font-medium">
                  {tier.name}
                </span>
                <span className="text-ink-900 text-xl font-bold">
                  {tier.price}
                </span>
              </a>
            ))}
          </Row>
        </Col>

        {/* Section 2: Track Record */}
        <Col className="gap-8">
          <Title className="text-center">A track record you can verify</Title>

          <Row className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
            <Col>
              <span className="text-primary-600 text-4xl font-bold">
                152,000+
              </span>
              <span className="text-ink-600">Resolved markets</span>
            </Col>
            <Col>
              <span className="text-primary-600 text-4xl font-bold">
                0.1725
              </span>
              <span className="text-ink-600">
                Average Brier score across all trades
              </span>
            </Col>
            <Col>
              <span className="text-primary-600 text-4xl font-bold">
                5,500+
              </span>
              <span className="text-ink-600">Monthly active traders</span>
            </Col>
          </Row>

          <Card className="p-6">
            <div className="border-ink-100 dark:border-ink-200 from-canvas-50/50 to-canvas-0 relative mb-4 rounded-xl border bg-gradient-to-br p-4 sm:p-6">
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90">
                <span className="text-ink-500 whitespace-nowrap text-xs font-medium uppercase tracking-wider">
                  Resolved Yes
                </span>
              </div>
              <div className="ml-4">
                <SizedContainer className="aspect-[4/3] w-full sm:aspect-video">
                  {(w, h) => (
                    <CalibrationChart points={points} width={w} height={h} />
                  )}
                </SizedContainer>
              </div>
              <div className="mt-4 text-center">
                <span className="text-ink-500 text-xs font-medium uppercase tracking-wider">
                  Market Probability
                </span>
              </div>
            </div>
            <p className="text-ink-600 text-sm italic">
              When Manifold's markets say 70%, the event happens about 70% of
              the time. Calibration data sourced from our own live metrics and
              corroborated by{' '}
              <a
                href="https://calibration.city"
                target="_blank"
                className="text-primary-600 hover:underline"
              >
                Calibration City
              </a>
              , an independent project tracking forecasting accuracy across
              Manifold, Polymarket, Kalshi, and Metaculus.
            </p>
          </Card>

          <p className="text-ink-800 text-lg">
            Manifold's forecasting accuracy is published continuously and
            compared head-to-head against real-money platforms. We don't curate
            the data, and we don't hide the markets we got wrong. If you want to
            verify our track record on a specific topic before you buy, the data
            is one click away.
          </p>
        </Col>

        {/* Section 3: How It Works */}
        <Col className="gap-8">
          <Title>From your question to a forecast, in four steps</Title>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {[
              {
                step: 1,
                title: 'Bring us a question',
                desc: 'Anything resolvable to a verifiable source — a regulatory decision, a project timeline, a commodity supply forecast, an event outcome. We can even help you sharpen the resolution criteria so the answer is unambiguous.',
              },
              {
                step: 2,
                title: 'We feature it on the platform',
                desc: 'Depending on the tier, that means homepage placement, a mana subsidy that incentivizes trading, and direct outreach to forecasters with strong track records in your topic area.',
              },
              {
                step: 3,
                title: 'Traders forecast continuously',
                desc: 'The market price updates in real time as traders trade and as news breaks. You can watch it live or pull the current value from our API any time.',
              },
              {
                step: 4,
                title: 'You get the answer',
                desc: "When the question resolves, you're notified. Until then, you have a calibrated, continuously-updated probability — and a public market trail that shows how the consensus moved and why.",
              },
            ].map((s) => (
              <Col key={s.step} className="gap-2">
                <div className="bg-primary-100 text-primary-700 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold">
                  {s.step}
                </div>
                <h3 className="text-ink-900 text-xl font-semibold">
                  {s.title}
                </h3>
                <p className="text-ink-700">{s.desc}</p>
              </Col>
            ))}
          </div>
        </Col>

        {/* Section 4: Pricing */}
        <Col className="gap-8">
          <Col>
            <Title>Pick a tier</Title>
            <p className="text-ink-700 text-lg">
              All tiers run on the same underlying market mechanism. The
              differences are how much liquidity we inject, how much trader
              recruitment we do, and how much we work with you to scope the
              question. Whiever you pick, you have access to 100% of Manifold's
              userbase.
            </p>
          </Col>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card id="boost" className="flex flex-col p-6">
              <h3 className="text-ink-900 text-2xl font-bold">Boost</h3>
              <div className="text-ink-900 mt-2 text-3xl font-bold">$100</div>
              <p className="text-ink-600 mt-2 italic">
                Get more eyes on your question.
              </p>
              <ul className="text-ink-700 mt-6 flex-1 space-y-4">
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Featured on the
                  Manifold homepage for 24 hours
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Visible to all
                  5,500+ monthly active traders
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Best for questions
                  you've already created that need attention
                </li>
              </ul>
              <Link href="/checkout" className="mt-8 block">
                <Button className="w-full" color="indigo-outline">
                  Buy Boost
                </Button>
              </Link>
            </Card>

            <Card
              id="stake"
              className="border-primary-500 relative flex flex-col border-2 p-6"
            >
              <div className="bg-primary-500 absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                Most Popular
              </div>
              <h3 className="text-ink-900 text-2xl font-bold">Stake</h3>
              <div className="text-ink-900 mt-2 text-3xl font-bold">$750</div>
              <p className="text-ink-600 mt-2 italic">
                Seed a market with real liquidity and the right traders.
              </p>
              <ul className="text-ink-700 mt-6 flex-1 space-y-4">
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Everything in
                  Boost
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Mana subsidy
                  injected directly into your market to incentivize trading
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Automated outreach
                  to top-PnL forecasters in the relevant category
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> 72-hour featured
                  window
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Best for niche
                  questions where you need to attract domain-relevant traders
                  quickly
                </li>
              </ul>
              <Link href="/checkout" className="mt-8 block">
                <Button className="w-full" color="indigo">
                  Buy Stake
                </Button>
              </Link>
            </Card>

            <Card id="commission" className="flex flex-col p-6">
              <h3 className="text-ink-900 text-2xl font-bold">Commission</h3>
              <div className="text-ink-900 mt-2 text-3xl font-bold">$2,500</div>
              <p className="text-ink-600 mt-2 italic">
                A hand-curated forecast with a named lead trader.
              </p>
              <ul className="text-ink-700 mt-6 flex-1 space-y-4">
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Everything in
                  Stake
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> 30-minute
                  onboarding call to refine your question and resolution
                  criteria
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Personal outreach
                  to specific high-PnL traders in your domain
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> 7-day featured
                  window
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Lead forecaster
                  attribution: the top-PnL trader in the relevant category is
                  noted alongside the result
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Scope-review
                  re-run: if after delivery you feel the question was
                  mis-scoped, we re-run it once at no additional charge
                </li>
              </ul>
              <Link
                href="https://calendly.com/manifoldmarkets"
                target="_blank"
                className="mt-8 block"
              >
                <Button className="w-full" color="indigo-outline">
                  Book onboarding call
                </Button>
              </Link>
            </Card>

            <Card id="custom" className="flex flex-col p-6">
              <h3 className="text-ink-900 text-2xl font-bold">Custom</h3>
              <div className="text-ink-900 mt-2 text-3xl font-bold">
                Contact us
              </div>
              <p className="text-ink-600 mt-2 italic">
                Bespoke engagements for ongoing forecasting needs.
              </p>
              <ul className="text-ink-700 mt-6 flex-1 space-y-4">
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Bundled forecast
                  packages — multiple linked questions on a single decision
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Private markets
                  visible only to specified users
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Recurring
                  forecasts revisited each cycle (quarterly, monthly, etc.)
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Larger mana
                  subsidies for very thin niches
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Team onboarding
                  for multiple users from one organization
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-500">✓</span> Combined deals
                  with API access, data export, or a private instance
                </li>
              </ul>
              <Link href="mailto:info@manifold.markets" className="mt-8 block">
                <Button className="w-full" color="indigo-outline">
                  Talk to us
                </Button>
              </Link>
            </Card>
          </div>
        </Col>

        {/* Section 5: How Customers Use Manifold */}
        <Col className="gap-8">
          <Title>What buying a forecast actually looks like</Title>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="flex flex-col gap-4 p-6">
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Customer
                </span>
                <p className="text-ink-900 font-medium">
                  A commodities trader at a mid-sized hedge fund
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Question
                </span>
                <p className="text-ink-800">
                  Will the EPA approve the new fuel additive standard by Q3?
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Tier purchased
                </span>
                <p className="text-ink-800">Stake</p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Evolution
                </span>
                <p className="text-ink-800">
                  Moved from 35% to 62% over five days as Reuters reported on
                  supply-chain disruptions.
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  How they used it
                </span>
                <p className="text-ink-800">
                  Pulled the price via API daily and used it as one input
                  alongside their analyst's view.
                </p>
              </div>
            </Card>

            <Card className="flex flex-col gap-4 p-6">
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Customer
                </span>
                <p className="text-ink-900 font-medium">
                  A policy researcher at a major think tank
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Question
                </span>
                <p className="text-ink-800">
                  Will the Supreme Court strike down the Chevron doctrine in
                  Loper Bright?
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Tier purchased
                </span>
                <p className="text-ink-800">Boost</p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Evolution
                </span>
                <p className="text-ink-800">
                  Started at 75% and steadily climbed to 90% as oral arguments
                  concluded.
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  How they used it
                </span>
                <p className="text-ink-800">
                  Cited the market probability in their weekly newsletter to
                  contextualize the likelihood of a major regulatory shift.
                </p>
              </div>
            </Card>

            <Card className="flex flex-col gap-4 p-6">
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Customer
                </span>
                <p className="text-ink-900 font-medium">
                  A corporate strategy director at a tech firm
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Question
                </span>
                <p className="text-ink-800">
                  Will the EU pass the AI Act with the open-source exemption
                  intact?
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Tier purchased
                </span>
                <p className="text-ink-800">Commission</p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  Evolution
                </span>
                <p className="text-ink-800">
                  Fluctuated between 40% and 60% during trilogue negotiations,
                  settling at 85% after the final draft leaked.
                </p>
              </div>
              <div>
                <span className="text-ink-500 text-xs font-bold uppercase tracking-wider">
                  How they used it
                </span>
                <p className="text-ink-800">
                  Used the forecast to decide whether to delay a major product
                  launch until the regulatory landscape was clearer.
                </p>
              </div>
            </Card>
          </div>
        </Col>

        {/* Section 6: Beyond Forecasts */}
        <Col className="gap-8">
          <Title>More ways to leverage Manifold</Title>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="flex flex-col p-6">
              <h3 className="text-ink-900 text-xl font-bold">API access</h3>
              <p className="text-ink-700 mt-2 flex-1">
                Higher rate limits than the public API and licensed for
                commercial use. Suitable for production use cases like
                dashboards, internal tools, and automated trading systems.
              </p>
              <Link href="mailto:info@manifold.markets" className="mt-4">
                <Button color="gray-outline">Contact us</Button>
              </Link>
            </Card>
            <Card className="flex flex-col p-6">
              <h3 className="text-ink-900 text-xl font-bold">
                Historical data export
              </h3>
              <p className="text-ink-700 mt-2 flex-1">
                Custom exports of historic price history and trade data across
                any subset of markets. Useful for backtesting, academic
                research, or training in-house models.
              </p>
              <Link href="mailto:info@manifold.markets" className="mt-4">
                <Button color="gray-outline">Contact us</Button>
              </Link>
            </Card>
            <Card className="flex flex-col p-6">
              <h3 className="text-ink-900 text-xl font-bold">
                Private instance
              </h3>
              <p className="text-ink-700 mt-2 flex-1">
                A whitelabel deployment of Manifold for use inside your
                organization. Custom economy tools and ongoing support included.
                Find out who in your organization is a superforecaster.
              </p>
              <Link href="mailto:info@manifold.markets" className="mt-4">
                <Button color="gray-outline">Contact us</Button>
              </Link>
            </Card>
          </div>
        </Col>

        {/* Section 7: FAQ */}
        <Col className="gap-8">
          <Title>Common questions</Title>
          <div className="flex flex-col">
            <FAQItem
              question="Why a market instead of a poll, expert call, or research report?"
              answer="Polls give you opinions; experts give you a single perspective; reports give you a snapshot in time. A market gives you a continuously-updated probability that incorporates the conviction-weighted views of everyone trading. Traders who put more behind their position move the price more, which means well-informed traders dominate the result. And because the market keeps trading as news breaks, you don't get a stale answer — you get one that updates the moment the world does."
            />
            <FAQItem
              question="Why play money? Doesn't that mean traders don't take it seriously?"
              answer={
                <>
                  Mana isn't purely play. Traders can convert their balance into
                  cash via our sweepstakes pool or into charitable donations at
                  favorable rates, so there's direct economic incentive to be
                  calibrated. Beyond that, academic research has found that
                  play-money markets perform statistically equivalently to
                  real-money markets on identical questions (Servan-Schreiber et
                  al. 2004). Our calibration data — published continuously —
                  holds up against real-money platforms like Polymarket and
                  Kalshi.
                </>
              }
            />
            <FAQItem
              question="What if no one trades on my question?"
              answer="The Stake tier injects a mana subsidy into the market and notifies top-PnL forecasters in the relevant category, which reliably draws traders even on niche topics. The Commission tier adds personal outreach to specific high-PnL traders in your domain. If your question is so unusual that we genuinely can't generate meaningful trading, we'll work with you to reframe it or refund."
            />
            <FAQItem
              question="What does the deliverable look like?"
              answer="The deliverable is the live market price, which you can view on Manifold or pull via our API. For Boost and Stake, that's the answer in numerical form. For Commission, you also get the lead forecaster — the top-PnL trader in the relevant category — noted alongside the result. For Custom engagements, deliverables are scoped to your needs."
            />
            <FAQItem
              question="How fast is turnaround?"
              answer="Boost is live within minutes of purchase. Stake is live within a few hours, once we configure the subsidy and outreach. Commission starts with an onboarding call we typically schedule within one to two business days, with the market live one to two days after that. Markets stay live until they resolve — sometimes minutes, sometimes years, depending on the question."
            />
            <FAQItem
              question="Can the question be private?"
              answer="For Boost, Stake, and Commission, no — questions live on the public platform, which is what generates the trader interest in the first place. If you need a private market visible only to specified users, that's a Custom engagement."
            />
            <FAQItem
              question="Who decides when a market resolves, and what if there's a dispute?"
              answer="Markets resolve based on the resolution criteria you set during onboarding, against a verifiable real-world source you specify (e.g., &quot;as reported by Reuters by [date]&quot;). For the Commission tier we work with you on the onboarding call to make these criteria unambiguous. If something genuinely unforeseen happens — the source disappears, the event becomes ill-defined — Manifold's moderation team handles it. For paid markets, we'll consult with you first."
            />
            <FAQItem
              question="What kinds of questions work best?"
              answer="Anything resolvable to a verifiable real-world source. Strongest fit: niche commodity or operations questions, specific regulatory or policy outcomes, project completion timelines, near-term financial events with clear resolution criteria. Weaker fit: very long-horizon questions (multi-year) where trader attention dissipates, questions whose resolution criteria are inherently subjective, or questions about events that have already publicly happened."
            />
            <FAQItem
              question="Can the market be manipulated?"
              answer="Markets with low liquidity can be moved by individual traders, which is exactly why the Stake and Commission tiers inject subsidy and recruit forecasters — to ensure enough liquidity that no single trade dominates. We monitor for unusual trading patterns and can intervene if a market is being deliberately distorted. For most questions, attempting to manipulate the price would cost more in mana than any benefit; the design is self-correcting."
            />
            <FAQItem
              question="Is there an insider-trading or MNPI concern?"
              answer="Manifold markets are not securities. Trading on them is not regulated as insider trading. That said, if you're concerned about information leakage from your organization — e.g., an employee with material non-public information trading in a way that signals it — the Custom tier supports private markets visible only to specified participants."
            />
            <FAQItem
              question="Can you provide invoices, W-9s, and DDQ responses?"
              answer="Yes. We can issue proper invoices for any tier, accept wire/ACH for Commission and Custom, and provide a W-9 on request. We respond to standard due-diligence questionnaires for institutional procurement."
            />
            <FAQItem
              question="What's the refund policy?"
              answer="Boost and Stake apply effects immediately when purchased — featured placement and mana subsidy go live, and trader notifications go out. If the delivered service doesn't match what's described — for instance, if the subsidy doesn't post or featured placement doesn't appear — contact us and we'll refund or re-run manually. For Commission, we commit to specific delivery terms (subsidy, trader outreach, featured window, scope-review re-run); if any aren't met, we refund. We don't refund based on the forecast itself being a number you didn't expect — probabilities are probabilities, and a well-calibrated 30% forecast on an event that happens isn't a wrong forecast."
            />
          </div>
        </Col>

        {/* Section 8: Above The Fold */}
        <Card className="bg-primary-50 border-primary-100 flex flex-col items-center gap-8 p-8 md:flex-row">
          <div className="flex-1">
            <h2 className="text-ink-900 text-2xl font-bold">
              See how we think about forecasting
            </h2>
            <p className="text-ink-700 mt-4 text-lg">
              <a
                href="https://news.manifold.markets/"
                target="_blank"
                className="text-primary-600 font-semibold hover:underline"
              >
                Above The Fold
              </a>{' '}
              is our weekly publication covering the markets that matter most —
              current events, deep dives on track records, technical analysis of
              high-stakes predictions. It's the best free way to see what
              Manifold's traders are paying attention to, and how we think about
              the questions worth asking.
            </p>
            <Link
              href="https://news.manifold.markets/"
              target="_blank"
              className="mt-6 inline-block"
            >
              <Button color="indigo">Read Above The Fold</Button>
            </Link>
          </div>
        </Card>

        {/* Section 9: Final CTA */}
        <Col className="items-center gap-6 py-12 text-center">
          <h2 className="text-ink-900 text-3xl font-bold sm:text-4xl">
            Have a question you need a forecast on?
          </h2>
          <p className="text-ink-700 text-xl">
            We can have it live in front of thousands of forecasters by
            tomorrow.
          </p>
          <Row className="mt-4 gap-4">
            <Link href="mailto:info@manifold.markets">
              <Button size="xl" color="indigo">
                Email us
              </Button>
            </Link>
            <Link href="https://calendly.com/manifoldmarkets" target="_blank">
              <Button size="xl" color="gray-outline">
                Book a call
              </Button>
            </Link>
          </Row>
        </Col>

        {/* Section 10: Footer / Disclaimer */}
        <div className="border-ink-200 mt-8 border-t pt-8">
          <p className="text-ink-500 text-sm italic">
            Manifold provides forecasting services and probability estimates
            derived from prediction-market activity. Manifold markets are not
            securities, and prices on Manifold do not constitute investment
            advice, recommendations, or solicitations of any kind. Forecasts are
            inherently probabilistic and may differ materially from realized
            outcomes. Customers are responsible for their own decisions and any
            actions taken on the basis of Manifold forecasts. By purchasing a
            Boost, Stake, Commission, or Custom engagement, you agree to
            Manifold's{' '}
            <Link href="/terms" className="underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </Col>
    </Page>
  )
}
