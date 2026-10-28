import { type JobEmployer } from 'common/job-seeker'

export type Job = {
  title: string
  location: string
  comp: string
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
}

// An employer on the board. Apply links are tracked and, for signed-in users,
// recorded per employer (set-job-applied), so every employer needs a slug
// from JOB_EMPLOYERS.
export type JobBoardEmployer = {
  id: JobEmployer
  name: string
  // Shown above the apply button on each of the employer's roles. Without it
  // the card says "To apply, email <contactEmail>."
  applyInstructions?: string
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

// Base ranges verified against each official sourceUrl on 25 Oct 2026. These are
// specific openings, not an automatically maintained feed. Remove a filled
// role from this array via PR, following the existing board's removal process.
// comp is the collapsed-card figure (US estimate); compDetails lists the
// published base ranges and the estimates by country.
export const UPSTART_JOBS: Job[] = [
  {
    title: 'Applied Scientist',
    team: 'Unsecured Underwriting · R-6422',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$235k–$325k',
    compDetails: [
      'US base: $141,500–$196,000',
      'US est. total: ~$235k–$325k',
    ],
    blurb:
      'Research and improve machine learning models for unsecured lending.',
    intro:
      'Join the Unsecured Underwriting Machine Learning team to improve credit decision models.',
    whatYoullDo: [
      'Develop and validate model improvements; evaluate their effect on lending decisions.',
      'Work with engineering to turn research into production models.',
    ],
    whatWereLookingFor: [
      'Graduate degree in a quantitative field and 0–2 years of relevant research experience.',
      'Python modeling, probability, statistics, machine learning, and experimental validation.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/4wztyny01us',
    workArrangement: remote,
    sourceUrl: 'https://careers.upstart.com/jobs/applied-scientist',
  },
  {
    title: 'Staff Applied Scientist',
    team: 'Unsecured Underwriting · R-00461',
    location: 'Remote (US/Canada, excl. Quebec)',
    comp: 'US est. total comp ~$335k–$460k',
    compDetails: [
      'US base: $199,500–$276,000',
      'US est. total: ~$335k–$460k',
    ],
    blurb: 'Advance underwriting models through rigorous applied research.',
    intro:
      'Join the Unsecured Underwriting Machine Learning team to improve predictive performance and model reliability.',
    whatYoullDo: [
      'Research, implement, and evaluate statistical and machine learning model improvements.',
      'Partner with engineering on technical reviews and production implementation.',
    ],
    whatWereLookingFor: [
      'Graduate degree in a quantitative field and 2+ years of relevant research experience.',
      'Python modeling, probability, statistics, machine learning, and experimental validation.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: 'https://grnh.se/1tgjz6f01us',
    workArrangement: `${remote} The team works across East/West Coast time zones.`,
    sourceUrl: 'https://careers.upstart.com/jobs/staff-applied-scientist',
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
