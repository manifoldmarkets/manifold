export type Job = {
  slug: string
  title: string
  company: string
  companyTagline: string
  type: 'full-time' | 'part-time' | 'contract'
  remote: 'remote' | 'remote-first' | 'hybrid' | 'on-site' | 'flexible'
  tags: string[]
  comp: string
  compNote?: string
  reportsTo?: string
  reportsToNote?: string
  stack?: string
  stackNote?: string
  stage: string
  stageNote?: string
  problemSolved: string
  theWork: string[]
  milestones: {
    thirtyDays: string
    ninetyDays: string
    oneYear: string
  }
  greatIf: string[]
  hardIf: string[]
  whoYouAre: string[]
  contactEmail: string
  listedDate: string
}

export const JOBS: Job[] = [
  {
    slug: 'mnx-backend-engineer',
    title: 'Backend Engineer',
    company: 'MNX — The AI Exchange',
    companyTagline:
      'Build the exchange infrastructure for a new class of AI and onchain markets.',
    type: 'full-time',
    remote: 'remote-first',
    tags: [
      'Backend systems',
      'Exchange infra',
      'Data pipelines',
      'Solidity / EVM',
      'Real-time data',
      'Crypto infra',
    ],
    comp: 'Base + equity',
    compNote: 'To be discussed',
    stack: 'Full-stack reach',
    stackNote: 'Backend-heavy',
    stage: 'Pre-launch',
    stageNote: '0 → 1 build',
    problemSolved:
      'The protocol is live onchain. What doesn’t exist yet is the production layer on top — the services, pipelines, and infrastructure that make it a real exchange. This hire builds and owns that layer.',
    theWork: [
      'Build and operate the backend services behind the exchange: APIs, market data, order and position state, and the systems that sit between the protocol and the UI',
      'Own key exchange infrastructure: data pipelines from oracles and price feeds, onchain event indexing, monitoring, and deploys',
      'Reach across the stack wherever the product needs you — internal tooling, integrations, performance, and reliability',
      'Help set engineering practices and own features end to end, from design through production',
    ],
    milestones: {
      thirtyDays: 'Across the codebase. First production services shipped.',
      ninetyDays: 'Core infra running reliably. Pipelines and monitoring solid.',
      oneYear: 'The platform scales with volume. You’ve shaped how the team builds.',
    },
    greatIf: [
      'End-to-end ownership of critical infrastructure',
      'Novel technical problems — real-time onchain data at scale',
      'Influence over how the engineering culture forms',
      'Variety — you’ll reach across the stack regularly',
    ],
    hardIf: [
      'Deep specialisation in one area only',
      'Mature tooling and established runbooks',
      'A large eng team to share the load',
      'Predictable, well-scoped sprints',
    ],
    whoYouAre: [
      'A strong generalist engineer with solid backend chops — building reliable services and data systems in production',
      'Comfortable across the stack and happy to context-switch; you reach for the right tool rather than the familiar one',
      'Some Solidity or EVM exposure is a real plus — enough to read contracts and contribute',
      'Bonus: experience with trading systems, real-time data, or crypto infra',
    ],
    contactEmail: 'dev@mnx.fi',
    listedDate: 'June 2026',
  },
  {
    slug: 'mnx-head-of-growth',
    title: 'Head of Growth',
    company: 'MNX — The AI Exchange',
    companyTagline:
      'Own the narrative and audience for a new class of AI and onchain markets.',
    type: 'full-time',
    remote: 'remote-first',
    tags: ['Brand & narrative', 'Audience building', 'Growth funnels', 'Crypto', 'Finance', 'AI'],
    comp: 'Base + equity',
    compNote: 'To be discussed',
    reportsTo: 'Founders',
    reportsToNote: 'Direct seat at the table',
    stage: 'Pre-launch',
    stageNote: '0 → 1 build',
    problemSolved:
      'MNX is launching markets nobody has ever traded before. The product needs a voice that can move seamlessly between crypto Twitter, AI research circles, and institutional trading desks — and turn that reach into real trading volume.',
    theWork: [
      'Own messaging, brand voice, and the public narrative across X, long-form writing, podcasts, and press',
      'Design the acquisition and activation funnel: who we reach, how they land, and what gets them placing real size',
      'Manage contractors to produce high quality content consistently',
      'Coordinate ecosystem partnerships across crypto and AI communities',
      'Set up analytics to know what’s actually working — and kill what isn’t',
    ],
    milestones: {
      thirtyDays: 'Voice and tone defined. First content live. Analytics baseline set.',
      ninetyDays: 'Consistent audience growth. Key partnerships in motion. Funnel instrumented.',
      oneYear: 'MNX is the recognised brand for AI-economy trading. Growth is a moat.',
    },
    greatIf: [
      'Full ownership of narrative from day one',
      'A genuinely novel product to build a story around',
      'Direct founder access and fast decision-making',
      'Reach across multiple high-signal communities',
    ],
    hardIf: [
      'An established brand and existing playbook',
      'A large marketing team around you',
      'Predictable channels and proven CAC',
      'Separation between crypto and AI audiences',
    ],
    whoYouAre: [
      'A high-agency generalist with excellent communication skills — written and verbal',
      'Track record building an audience, whether for a company, event, or personal brand',
      'Fluency in some subset of finance, AI, and crypto — comfortable across all three worlds',
      'Comfortable with ambiguity and operating at pace in an early-stage environment',
      'Bonus: existing audience or relationships across crypto-trading and AI communities',
    ],
    contactEmail: 'growth@mnx.fi',
    listedDate: 'June 2026',
  },
  {
    slug: 'mnx-quant-trader',
    title: 'Quantitative Trader',
    company: 'MNX — The AI Exchange',
    companyTagline:
      'Make markets across a catalog of instruments nobody has ever traded before.',
    type: 'full-time',
    remote: 'remote-first',
    tags: ['Market making', 'Derivatives pricing', 'Risk management', 'Crypto perps', 'Onchain'],
    comp: 'Performance-based',
    compNote: 'Heavily perf-weighted',
    stack: 'Quant + trading systems',
    stackNote: 'Novel instruments',
    stage: 'Pre-launch',
    stageNote: '0 → 1 build',
    problemSolved:
      'The exchange has markets nobody has ever traded before — private-lab valuations, H100 prices, equity perps. Making them liquid, priceable, and robust under stress is the hardest and most important problem on the exchange. You own the liquidity vault and the book.',
    theWork: [
      'Manage the protocol liquidity vault',
      'Make markets across the catalog: quote, hedge, and manage funding rates on perps and event markets',
      'Build pricing and risk models for thin, novel underlyings where no clean reference market exists',
      'Own risk: position limits, exposure, liquidations, and the behavior of the book under stress',
      'Partner with engineering on vault mechanics, oracle inputs, and settlement; with growth on which markets to list next',
    ],
    milestones: {
      thirtyDays: 'Vault live. Core markets quoted and basic hedging in place.',
      ninetyDays: 'Book running with disciplined risk limits. Novel instruments priced with confidence.',
      oneYear:
        'Deep, reliable liquidity across the full catalog. You’ve set the standard for how the exchange trades.',
    },
    greatIf: [
      'Pricing instruments nobody else has priced before',
      'Real P&L ownership with performance-linked upside',
      'Novel risk problems at the frontier of crypto and TradFi',
      'High autonomy and direct influence on exchange depth',
    ],
    hardIf: [
      'Pure execution with no pricing discretion',
      'Mature, liquid markets with established reference prices',
      'TradFi-only — need some crypto exposure',
      'Fixed or guaranteed compensation',
    ],
    whoYouAre: [
      'Market-making or quant-trading experience: crypto perps, TradFi derivatives, or both',
      'Comfort pricing illiquid and unusual instruments, and sizing risk under genuine uncertainty',
      'Sharp risk discipline and a calm hand when markets move',
      'Bonus: onchain trading experience, automated MM systems, or a research background in derivatives pricing',
    ],
    contactEmail: 'gamma@mnx.fi',
    listedDate: 'June 2026',
  },
]

export function getJobBySlug(slug: string): Job | undefined {
  return JOBS.find((j) => j.slug === slug)
}
