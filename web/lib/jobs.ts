import { type JobEmployer } from 'common/job-seeker'

export type Job = {
  title: string
  location: string
  // Collapsed-card pay line; leave it out when the employer publishes none.
  comp?: string
  blurb: string
  intro: string
  whatYoullDo: string[]
  whatWereLookingFor: string[]
  contactEmail: string
  employmentType?: 'Full time' | 'Internship'
  // Program length, shown in the type pill (e.g. "Internship · 12 weeks").
  duration?: string
  team?: string
  sourceUrl?: string
  workArrangement?: string
  // Shown one per line in the expanded card (published base, then estimate).
  compDetails?: string[]
  // Tracking URL (opens in a new tab) or mailto. Without it the card emails
  // contactEmail with the role in the subject.
  applicationUrl?: string
  // Shown above the apply button in place of "To apply, email <contactEmail>."
  applyText?: string
}

// An employer on the board. Apply links are tracked and, for signed-in users,
// recorded per employer (set-job-applied), so every employer needs a slug
// from JOB_EMPLOYERS.
export type JobBoardEmployer = {
  id: JobEmployer
  name: string
}

export const UPSTART: JobBoardEmployer = { id: 'upstart', name: 'Upstart' }

export const MNX: JobBoardEmployer = { id: 'mnx', name: 'MNX' }

// Upstart recruiting issued one Greenhouse tracking link per role (28 Oct
// 2026). Applying through it tags Manifold as the candidate source in their
// dashboard, so a role's Apply and details links must both use it. Ask
// Upstart for a link before listing a new role.
export const UPSTART_EMAIL = 'joe.orsini@upstart.com'

const remote =
  'Remote with regular in-person collaboration; most teams meet once or twice per quarter for 2–4 days.'
// Total comp is estimated at 5/3 of base until Upstart supplies per-role
// figures: the ratio implied by its indicative midpoint of ~$320k total on
// ~$192k base (~$30k target bonus + ~$98k equity). Rounded to $5k.

// These are specific openings, not an automatically maintained feed. Remove a
// filled role from this array via PR, following the existing board's removal
// process. comp is the collapsed-card figure (US estimate); compDetails lists
// the published base ranges and the estimates by country.
//
// On 11 Nov 2026 Upstart consolidated its Applied Scientist postings into three
// levels under one requisition (1139); those replace the earlier Applied and
// Staff Applied Scientist listings. Their base ranges were checked on Upstart's
// Greenhouse board on 12 Nov. The board labels the Senior and Staff ranges
// "Canada" but prices them in USD, and Staff's matches its earlier US range, so
// both are shown as US. Senior total comp is the figure Upstart recruiting
// gave; the others are estimated as above. The Intern and Principal base ranges
// were verified against their sourceUrls on 25 Oct.
export const UPSTART_JOBS: Job[] = [
  {
    title: 'Applied Scientist',
    team: 'Machine Learning · 1139',
    location: 'Remote (US)',
    comp: 'US est. total comp ~$235k–$325k',
    compDetails: [
      'US base: $141,500–$196,000',
      'US est. total: ~$235k–$325k',
    ],
    blurb:
      'Build and evaluate machine learning models that support lending decisions.',
    intro:
      'Join Upstart’s Machine Learning team to develop models that improve how it evaluates risk and makes lending decisions.',
    whatYoullDo: [
      'Develop, train, and evaluate models, and analyze large datasets to build features.',
      'Design experiments and work with engineers to run and refine models in production.',
    ],
    whatWereLookingFor: [
      'Bachelor’s in a quantitative field or equivalent experience, and 0–2 years in machine learning or applied statistics; a PhD is preferred.',
      'Python modeling and statistical methods such as hypothesis testing, regression, and predictive modeling.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/uwqm8abw1us',
    workArrangement: remote,
    sourceUrl:
      'https://careers.upstart.com/jobs/applied-scientist-8180df44-08c6-4cbd-85b7-9e219310e3cb',
  },
  {
    title: 'Senior Applied Scientist',
    team: 'Machine Learning · 1139',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$300k–$396k',
    compDetails: [
      'US base: $167,700–$231,800',
      'US est. total: ~$300k–$396k',
    ],
    blurb:
      'Lead machine learning modeling work from problem framing to production.',
    intro:
      'Own complex modeling problems on Upstart’s Machine Learning team, from initial investigation through production, and help shape its technical approach.',
    whatYoullDo: [
      'Lead models end to end: problem formulation, experimentation, deployment, and evaluation.',
      'Improve existing models through new features and rigorous experiments, and review the team’s methods.',
    ],
    whatWereLookingFor: [
      'Bachelor’s in a quantitative field or equivalent experience, and 3+ years building and evaluating machine learning models; a PhD is preferred.',
      'Python machine learning frameworks, experiment design, and experience running models in production.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/jucexs1a1us',
    workArrangement: remote,
    sourceUrl:
      'https://careers.upstart.com/jobs/senior-applied-scientist-f9734550-44d4-48a0-85f7-57281a66039d',
  },
  {
    title: 'Staff Applied Scientist',
    team: 'Machine Learning · 1139',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$335k–$460k',
    compDetails: [
      'US base: $199,500–$276,000',
      'US est. total: ~$335k–$460k',
    ],
    blurb: 'Set the technical direction for high-impact machine learning work.',
    intro:
      'Provide technical leadership on Upstart’s Machine Learning team: define approaches to ambiguous problems and shape modeling strategy across teams.',
    whatYoullDo: [
      'Turn broad business goals into scientific strategies, and lead the design of advanced models.',
      'Set best practices for model development and evaluation, and mentor scientists.',
    ],
    whatWereLookingFor: [
      'Bachelor’s in a quantitative field or equivalent experience, and 4+ years building machine learning models or applying advanced statistics; a PhD is preferred.',
      'Experience leading the design of production machine learning systems across multiple teams or stakeholders.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/ar1jgwyz1us',
    workArrangement: remote,
    sourceUrl:
      'https://careers.upstart.com/jobs/staff-applied-scientist-2f49df47-93dc-41f7-8dd6-b43e45166c8d',
  },
  {
    title: 'Applied Scientist Intern',
    team: 'Machine Learning · R-00328',
    employmentType: 'Internship',
    duration: '12 weeks',
    location: 'Remote (US)',
    comp: '$68–$72/hour',
    blurb:
      'Apply statistical and machine learning research during an internship.',
    intro: 'Work on applied modeling with Upstart’s Machine Learning team.',
    whatYoullDo: [
      'Develop models and use data analysis to investigate modeling questions.',
    ],
    whatWereLookingFor: [
      'Bachelor’s, master’s, or PhD study in a quantitative field, on track to graduate by 2028.',
      'Python machine learning or statistical modeling, basic SQL, communication, and teamwork.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/9b5rkxlx1us',
    workArrangement:
      'A 12-week program, fully remote in the US, with one or two in-person collaboration sessions of 2–4 days.',
    sourceUrl: 'https://careers.upstart.com/jobs/applied-scientist-intern',
  },
  {
    title: 'Principal Data Scientist',
    team: 'Product & Growth Analytics · R-00264',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$325k–$450k',
    compDetails: [
      'US base: $195,300–$270,400; Canada base: $182,800–$230,000 CAD',
      'US est. total: ~$325k–$450k; Canada est. total: ~$305k–$385k CAD',
    ],
    blurb:
      'Guide product and business strategy through experimentation and causal analysis.',
    intro:
      'Partner with product, marketing, finance, and machine learning leaders on strategic decisions.',
    whatYoullDo: [
      'Build forecasting, spend optimization, incrementality, and attribution tools.',
      'Own experiments and measurement frameworks, from the initial question to recommendations.',
    ],
    whatWereLookingFor: [
      '8+ years in data science or quantitative work influencing product or business strategy.',
      'Experimental design, causal inference, Python or equivalent, and strong stakeholder communication.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/2y3wbm1i1us',
    workArrangement: remote,
    sourceUrl: 'https://careers.upstart.com/jobs/principal-data-scientist',
  },
  {
    title: 'Principal Data Scientist, Marketing Measurement',
    team: 'Marketing Science · R-00450',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$325k–$450k',
    compDetails: [
      'US base: $195,300–$270,400; Canada base: $182,800–$230,000 CAD',
      'US est. total: ~$325k–$450k; Canada est. total: ~$305k–$385k CAD',
    ],
    blurb:
      'Measure marketing impact and guide how growth budgets are allocated.',
    intro:
      'Lead measurement across marketing channels in the Growth, Product, and Ops Analytics team.',
    whatYoullDo: [
      'Combine incrementality tests, causal inference, attribution, and marketing mix models.',
      'Turn measurement into budget recommendations and mentor analysts.',
    ],
    whatWereLookingFor: [
      '8+ years in data science or quantitative work, with substantial marketing measurement experience.',
      'Incrementality testing, causal inference, marketing mix modeling, multi-touch attribution, Python, and SQL.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/4zgogvd61us',
    workArrangement: remote,
    sourceUrl:
      'https://careers.upstart.com/jobs/principal-data-scientist-marketing-measurement',
  },
]
