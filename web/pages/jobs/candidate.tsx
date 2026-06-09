import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

const CANDIDATE = {
  firstName: 'Jamie',
  lastInitial: 'K.',
  initials: 'JK',
  summary: 'Quant trader & market maker — 6 years across crypto perps and TradFi derivatives. Built and ran MM books at two exchanges.',
  location: 'London',
  workPreference: 'Remote preferred',
  education: 'MSc Financial Mathematics, UCL',
  profileViews: 34,
  status: 'Actively looking' as const,
  tags: ['Market making', 'Derivatives pricing', 'Risk management', 'Crypto perps', 'Python', 'C++', 'Onchain'],
  stats: {
    experience: { label: 'Experience', value: '6 years', sub: 'MM + quant trading' },
    comp: { label: 'Comp target', value: '$180–240k', sub: '+ perf / equity' },
    availability: { label: 'Availability', value: '4 weeks', sub: 'Notice period' },
    openTo: { label: 'Open to', value: 'Early-stage', sub: 'Seed to Series B' },
  },
  workSamples: [
    {
      title: 'Built and ran the ETH/BTC perp MM book at a mid-size crypto exchange',
      context: 'Crypto exchange',
      dates: '2022–2024',
      description:
        'Took over an illiquid book with wide spreads and poor fill rates. Rebuilt the pricing model, tightened quotes by 40%, and automated inventory hedging via delta-neutral positions across spot and perps. Managed funding rate exposure across 8 pairs simultaneously.',
      outcome: '↑ Volume 3× in 6 months',
    },
    {
      title: 'Priced and launched exotic options on a TradFi desk',
      context: 'Investment bank',
      dates: '2020–2022',
      description:
        'Part of a small team pricing barrier and variance swap products for institutional clients. Owned the vol surface calibration for EM equity underlyings with thin reference markets — similar problem set to novel crypto instruments.',
      outcome: 'First EM vol surface model at the desk',
    },
  ],
  skills: [
    { name: 'Derivatives pricing', level: 'Expert', fill: 1 },
    { name: 'Risk management', level: 'Expert', fill: 1 },
    { name: 'Automated MM systems', level: 'Strong', fill: 0.75 },
    { name: 'Python / quant tools', level: 'Strong', fill: 0.75 },
    { name: 'Onchain / DeFi', level: 'Growing', fill: 0.4 },
    { name: 'C++ / low latency', level: 'Familiar', fill: 0.2 },
  ],
  wants: [
    'Real ownership of a book, not just execution',
    'Novel instruments — thin markets over liquid ones',
    'Perf-linked comp with meaningful upside',
    'Small team, fast decisions, direct founder access',
  ],
  wontDo: [
    'Pure execution roles with no pricing discretion',
    'TradFi-only — need some crypto exposure',
    'Flat salary only, no performance upside',
    'Full-time office, 5 days a week',
  ],
  lastActive: '2 days ago',
  joined: 'May 2026',
}

const STATUS_COLORS = {
  'Actively looking': 'bg-green-500',
  'Open to opportunities': 'bg-yellow-400',
  'Not looking': 'bg-ink-300',
}

function SkillBar({ name, level, fill }: { name: string; level: string; fill: number }) {
  return (
    <Row className="items-center gap-3">
      <span className="text-ink-700 w-44 shrink-0 text-sm">{name}</span>
      <div className="bg-ink-100 relative h-1.5 flex-1 rounded-full overflow-hidden">
        <div
          className="bg-primary-500 absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <span className="text-ink-400 w-16 shrink-0 text-right font-mono text-xs">{level}</span>
    </Row>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <Row className="mb-4 items-center gap-3">
      <span className="text-ink-400 shrink-0 font-mono text-xs uppercase tracking-widest">
        {label}
      </span>
      <div className="border-ink-100 h-px flex-1 border-t" />
    </Row>
  )
}

export default function CandidatePage() {
  const statusDot = STATUS_COLORS[CANDIDATE.status]

  return (
    <Page trackPageView="/jobs/candidate" className="!col-span-7">
      <SEO
        title={`${CANDIDATE.firstName} ${CANDIDATE.lastInitial} — Manifold Jobs`}
        description={CANDIDATE.summary}
        url="/jobs/candidate"
      />
      <Col className="mx-auto w-full max-w-3xl p-4 py-6">

        {/* Back nav */}
        <div className="mb-8">
          <Link
            href="/jobs"
            className="text-ink-400 hover:text-primary-600 font-mono text-xs uppercase tracking-widest transition-colors"
          >
            ← All roles
          </Link>
        </div>

        {/* Profile header */}
        <Row className="mb-6 items-start gap-4">
          <div className="bg-primary-100 text-primary-700 flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-mono text-lg font-semibold">
            {CANDIDATE.initials}
          </div>
          <Col className="min-w-0 flex-1 gap-1">
            <Row className="items-center justify-between gap-3">
              <h1 className="text-ink-1000 text-2xl font-semibold">
                {CANDIDATE.firstName} {CANDIDATE.lastInitial}
              </h1>
              <Row className="shrink-0 items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 dark:border-green-800 dark:bg-green-950/30">
                <span className={`h-2 w-2 rounded-full ${statusDot}`} />
                <span className="font-mono text-xs font-medium text-green-700 dark:text-green-400">
                  {CANDIDATE.status}
                </span>
              </Row>
            </Row>
            <p className="text-ink-600 text-sm leading-relaxed">{CANDIDATE.summary}</p>
            <Row className="mt-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ink-400 text-xs">
                {CANDIDATE.location} · {CANDIDATE.workPreference}
              </span>
              <span className="text-ink-300 text-xs">·</span>
              <span className="text-ink-400 text-xs">{CANDIDATE.education}</span>
              <span className="text-ink-300 text-xs">·</span>
              <span className="text-ink-400 text-xs">
                {CANDIDATE.profileViews} profile views this week
              </span>
            </Row>
          </Col>
        </Row>

        {/* Tags */}
        <Row className="mb-6 flex-wrap gap-1.5">
          {CANDIDATE.tags.map((tag) => (
            <span
              key={tag}
              className="border-ink-200 text-ink-600 rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </span>
          ))}
        </Row>

        {/* Stats */}
        <Row className="mb-10 gap-2">
          {Object.values(CANDIDATE.stats).map((stat) => (
            <Col
              key={stat.label}
              className="border-ink-100 bg-canvas-50 min-w-0 flex-1 gap-0 rounded-lg border px-4 py-3"
            >
              <span className="text-ink-400 mb-1 font-mono text-[10px] uppercase tracking-widest">
                {stat.label}
              </span>
              <span className="text-ink-900 text-sm font-semibold leading-snug">{stat.value}</span>
              <span className="text-ink-400 mt-0.5 text-xs">{stat.sub}</span>
            </Col>
          ))}
        </Row>

        {/* What I've built */}
        <div className="mb-10">
          <Divider label="What I've built" />
          <Col className="gap-4">
            {CANDIDATE.workSamples.map((sample, i) => (
              <Col
                key={i}
                className="border-ink-100 rounded-lg border p-5"
              >
                <Row className="mb-1 items-start justify-between gap-3">
                  <h3 className="text-ink-900 text-sm font-semibold leading-snug">
                    {sample.title}
                  </h3>
                </Row>
                <span className="text-ink-400 mb-3 font-mono text-xs">
                  {sample.context} · {sample.dates}
                </span>
                <p className="text-ink-600 mb-3 text-sm leading-relaxed">{sample.description}</p>
                <div className="inline-block">
                  <span className="bg-primary-50 text-primary-700 border-primary-200 rounded-full border px-2.5 py-0.5 font-mono text-xs dark:bg-primary-950/20 dark:text-primary-400">
                    {sample.outcome}
                  </span>
                </div>
              </Col>
            ))}
          </Col>
        </div>

        {/* Skills & depth */}
        <div className="mb-10">
          <Divider label="Skills & depth" />
          <Col className="gap-3">
            {CANDIDATE.skills.map((skill) => (
              <SkillBar key={skill.name} {...skill} />
            ))}
          </Col>
        </div>

        {/* What I'm looking for */}
        <div className="mb-10">
          <Divider label="What I'm looking for" />
          <Row className="gap-3">
            <Col className="min-w-0 flex-1 rounded-lg border border-l-4 border-green-200 border-l-green-500 bg-green-50 p-5 dark:border-green-900 dark:border-l-green-500 dark:bg-green-950/20">
              <span className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
                I want
              </span>
              <ul className="flex flex-col gap-2.5">
                {CANDIDATE.wants.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug text-green-900 dark:text-green-300">
                    <span className="mt-0.5 shrink-0 font-mono">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Col>
            <Col className="min-w-0 flex-1 rounded-lg border border-l-4 border-orange-200 border-l-orange-400 bg-orange-50 p-5 dark:border-orange-900 dark:border-l-orange-400 dark:bg-orange-950/20">
              <span className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
                I won't do
              </span>
              <ul className="flex flex-col gap-2.5">
                {CANDIDATE.wontDo.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug text-orange-900 dark:text-orange-300">
                    <span className="mt-0.5 shrink-0 font-mono">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Col>
          </Row>
        </div>

        {/* Footer */}
        <Row className="border-ink-100 items-center justify-between border-t pt-6">
          <span className="text-ink-400 font-mono text-xs">
            Last active {CANDIDATE.lastActive} · Joined {CANDIDATE.joined}
          </span>
          <Row className="gap-2">
            <button className="border-ink-200 text-ink-600 hover:border-ink-300 rounded-lg border px-4 py-2 text-sm transition-colors">
              Save
            </button>
            <button className="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2 font-mono text-sm text-white transition-colors">
              Reach out →
            </button>
          </Row>
        </Row>

      </Col>
    </Page>
  )
}
