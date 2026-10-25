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
  team?: string
  sourceUrl?: string
  workArrangement?: string
  compNote?: string
  // Total compensation (base + target bonus + equity), shown beside base pay.
  totalComp?: string
  applicationUrl?: string
}

// Application instructions per the Upstart recruiting contact (Oct 2026).
// A mailto opens a draft; applicants must attach their resume themselves.
export const UPSTART_EMAIL = 'joe.orsini@upstart.com'
export const UPSTART_APPLY_URL = `mailto:${UPSTART_EMAIL}?subject=${encodeURIComponent(
  'Upstart opportunities via Manifold'
)}&body=${encodeURIComponent(
  'Hi Joe,\r\n\r\nI found Upstart on Manifold and would like to apply broadly for any/all suitable roles.\r\n\r\nI have attached my resume.\r\n\r\nThank you!'
)}`

const remote =
  'Remote with regular in-person collaboration; most teams meet once or twice per quarter for 2–4 days. Confirm eligibility and travel with the recruiter.'
const baseNote =
  'Published anticipated base salary; pay depends on location and experience. Total compensation adds a target bonus and annual equity on top of base. See the official listing for full details.'
// Upstart publishes base ranges only. Until it supplies per-role total-comp
// figures, totalComp describes the package rather than quantifying it.
const fullTimeTotalComp =
  'Total comp: base + target bonus + annual equity grants (vest quarterly)'

// Base ranges verified against each official sourceUrl on 25 Oct 2026. These are six
// specific openings, not an automatically maintained feed. Remove a filled
// role from this array via PR, following the existing board's removal process.
// Only published base ranges are quantified; no total-comp figures are invented.
export const UPSTART_JOBS: Job[] = [
  {
    title: 'Applied Scientist',
    team: 'Unsecured Underwriting · R-6422',
    location: 'Remote · US or Canada (excluding Quebec)',
    comp: 'US base: $141,500–$196,000 USD',
    compNote: baseNote,
    totalComp: fullTimeTotalComp,
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
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement: remote,
    sourceUrl: 'https://careers.upstart.com/jobs/applied-scientist',
  },
  {
    title: 'Staff Applied Scientist',
    team: 'Unsecured Underwriting · R-00461',
    location: 'Remote · US or Canada (excluding Quebec)',
    comp: 'US base: $199,500–$276,000 USD',
    compNote: baseNote,
    totalComp: fullTimeTotalComp,
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
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement: `${remote} The team works across East/West Coast time zones.`,
    sourceUrl: 'https://careers.upstart.com/jobs/staff-applied-scientist',
  },
  {
    title: 'Applied Scientist',
    team: 'Growth / Direct Mail · R-7046',
    location: 'Remote · US or Canada (excluding Quebec)',
    comp: 'US base: $141,500–$196,000 USD; Canada base: $130,900–$160,000 CAD',
    compNote: baseNote,
    totalComp: fullTimeTotalComp,
    blurb:
      'Use causal machine learning to improve borrower acquisition across marketing channels.',
    intro:
      'Join the Machine Learning Growth team, expanding direct mail modeling into other marketing channels.',
    whatYoullDo: [
      'Develop acquisition models, analyze campaigns, and measure incremental impact through experiments.',
      'Build reusable data pipelines and collaborate with Growth and Marketing Platform Engineering.',
    ],
    whatWereLookingFor: [
      'Master’s degree in mathematics, statistics, economics, operations research, or a related field.',
      'Statistical and machine learning modeling, Python, causal inference, and experimental design.',
    ],
    contactEmail: UPSTART_EMAIL,
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement: remote,
    sourceUrl:
      'https://careers.upstart.com/jobs/applied-scientist-42b12dad-ec21-460b-8789-41be8ded8f26',
  },
  {
    title: 'Applied Scientist Intern',
    team: 'Machine Learning · R-00328',
    employmentType: 'Internship',
    location: 'Fully remote · US',
    comp: 'About $68–$72 per hour (USD)',
    compNote:
      'Shown hourly: Upstart publishes this internship as a $141,000–$150,000 annualized range, which is about $68–$72 per hour over 2,080 hours. Confirm the rate and internship dates with the recruiter.',
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
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement:
      'Fully remote in the US, with one or two in-person collaboration sessions of 2–4 days during the internship.',
    sourceUrl: 'https://careers.upstart.com/jobs/applied-scientist-intern',
  },
  {
    title: 'Principal Data Scientist',
    team: 'Product & Growth Analytics · R-00264',
    location: 'Remote · US; Canada salary range also published',
    comp: 'US base: $195,300–$270,400 USD; Canada base: $182,800–$230,000 CAD',
    compNote: baseNote,
    totalComp: fullTimeTotalComp,
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
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement: `${remote} The listing describes US remote work and also publishes Canadian compensation; confirm Canadian location eligibility with the recruiter.`,
    sourceUrl: 'https://careers.upstart.com/jobs/principal-data-scientist',
  },
  {
    title: 'Principal Data Scientist, Marketing Measurement',
    team: 'Marketing Science · R-00450',
    location: 'Remote · US; Canada salary range also published',
    comp: 'US base: $195,300–$270,400 USD; Canada base: $182,800–$230,000 CAD',
    compNote: baseNote,
    totalComp: fullTimeTotalComp,
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
    applicationUrl: UPSTART_APPLY_URL,
    workArrangement: `${remote} The listing describes US remote work and also publishes Canadian compensation; confirm Canadian location eligibility with the recruiter.`,
    sourceUrl:
      'https://careers.upstart.com/jobs/principal-data-scientist-marketing-measurement',
  },
]
