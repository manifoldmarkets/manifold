// Controlled vocabulary for the /jobs board "register interest" feature.
//
// We store the *slugs* (not the display labels) in the job_seeker_interest
// table so labels can be reworded without breaking stored data or the pitch
// queries (e.g. count of users with 'trading-quant' in skills). Add/remove
// options here and both the form and any analytics stay in sync.

export const JOB_SKILLS = [
  'software',
  'data-ml',
  'trading-quant',
  'finance',
  'marketing-growth',
  'design',
  'product',
  'ops',
  'writing',
  'research',
  'sales-bd',
  'legal',
] as const

export type JobSkill = (typeof JOB_SKILLS)[number]

export const JOB_SKILL_LABELS: Record<JobSkill, string> = {
  software: 'Software / Eng',
  'data-ml': 'Data / ML',
  'trading-quant': 'Trading / Quant',
  finance: 'Finance / Accounting',
  'marketing-growth': 'Marketing / Growth',
  design: 'Design',
  product: 'Product',
  ops: 'Ops / BizOps',
  writing: 'Writing / Content',
  research: 'Research / Forecasting',
  'sales-bd': 'Sales / BD',
  legal: 'Legal / Compliance',
}

// Sectors / role-types the user wants to hear about. One axis only: keep this
// to "what kind of job" (not work-style or employment-type — those belong on
// their own controls). Curated for Manifold's forecaster/quant userbase and
// the employers who pay to recruit them.
export const JOB_INTERESTS = [
  'trading-firms',
  'hedge-funds',
  'crypto',
  'ai',
  'fintech',
  'forecasting',
  'research',
  'ea-nonprofit',
  'startups',
  'tech',
  'internships',
] as const

export type JobInterest = (typeof JOB_INTERESTS)[number]

export const JOB_INTEREST_LABELS: Record<JobInterest, string> = {
  'trading-firms': 'Trading firms',
  'hedge-funds': 'Hedge / quant funds',
  crypto: 'Crypto / Web3',
  ai: 'AI / ML',
  fintech: 'Fintech',
  forecasting: 'Forecasting / prediction markets',
  research: 'Research',
  'ea-nonprofit': 'EA / nonprofit / policy',
  startups: 'Early startups',
  tech: 'Tech / software',
  internships: 'Internships',
}

// Coarse, self-reported location for employer targeting. Single-select and
// optional — a different axis from interests, and kept out of the headline
// "N interested in X" stat. US-weighted to match the userbase and recruiters.
export const JOB_REGIONS = [
  'us-east',
  'us-central',
  'us-west',
  'canada',
  'europe',
  'elsewhere',
] as const

export type JobRegion = (typeof JOB_REGIONS)[number]

export const JOB_REGION_LABELS: Record<JobRegion, string> = {
  'us-east': 'US – East',
  'us-central': 'US – Central',
  'us-west': 'US – West',
  canada: 'Canada',
  europe: 'Europe',
  elsewhere: 'Elsewhere',
}

export type JobSeekerInterest = {
  userId: string
  skills: JobSkill[]
  interests: JobInterest[]
  region: JobRegion | null
  openToContact: boolean
  createdTime: number
  updatedTime: number
}
