import { Contract } from 'common/contract'
import { api } from 'web/lib/api/api'
import { convertContract, getContracts } from '../common/src/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { contractFields } from '../common/src/supabase/contracts'

// export async function getAiSurveyContracts(): Promise<Contract[]> {
//   const { data, error } = await db
//     .from('contracts')
//     .select(contractFields)
//     .contains('group_slugs', ['ai-2025-forecasting-survey-by-ai-di'])

//   if (error) {
//     console.error('Error fetching ai survey contracts:', error)
//     return []
//   }

//   return data.map((row) => convertContract(row))
// }

const aiSurveyContractIds = [
  '9cy09yhQd2',
  'hRU0NuZhSy',
  'AELz6Q2usA',
  'EzN2u8OQq2',
  'Uul0EZt0td',
  'z8sPq6NSqQ',
  'dL2Rl06NUI',
  'EQqSEhAuOd',
]

const shortAiBenchmarkContractIds = [
  'CkzcqS69tr1hOS56mjZY',
  '4cobxeU2KSBo5BPSFCKe',
  '	tXYiojNCLmLSJVfGUGK5',
  'hhnUhg5pty',
  'SfBHzKtfZhIqeV2gcLuZ',
  '	BcJbQTDX1rdmaLYGKUOz',
  'osbD00CDUgcQGPHhH0mn',
  '7yaoogxozx',
]

const longAiBenchmarkContractIds = [
  'dI5U6ps6IP',
  'DKWUoTfIrbxHwQloZLG3',
  '	j7IOXyBOzFiYHtVFXWP3',
  'Red8L367S1DreBesRRu3',
  '	ymaev6DmK5AlzKdaTqOt',
  '	HJdflF0LTJwPNKQmaf6G',
]

const aiPolicyContractIds = [
  '0YCYyjBNcZ2XW9Qer4sD',
  'Twyw0JCFW7VXfa4vl0d6',
  'zo6v3r95mq',
  'PEAh4AsufK9Xdy8kKker',
  '	Lb3FC1lLBtU5KySEbVzJ',
  '	Uxu9dll7SdYVTGUEmebV',
  'p83DN95Vy7eQPXRsSgpR',
  'U58ue9CkiHRqrgmPlr0S',
  '	DKtHVhTHJu2lcEfwmnlP',
  '0odd65dzft',
  '	QuNoQ7wHgdFBetB3K4jT',
  'g6Cz8nQZy5',
  '8wp0xc905e',
]

const aiCompaniesContractIds = [
  '	uA88Oc5Uqs',
  '5M2I0YYBYCstkwDI3yDK',
  '	BmK6wCA9ol7sjaqB9ZGt',
  'rALUJE3xQLyBEGoW1j9Q',
  'C8MtRn2ixX8Y0rV2Oqcy',
  '	h6yuo5ag84',
  'lp17jc8bxl',
  '	iz2ovejkv3',
  '	UpfNoFH6Q6sU3HAZ2SzR',
  'RB1446KxI8aNMAiaIEDl',
  'a9QwFRF9xYWbjhGi4dde',
  '	1m08c366fh',
]

const releaseDateContractIds = []

export async function getAiSurveyContracts(): Promise<Contract[]> {
  // Fetch the contracts by their IDs
  const contracts = await getContracts(db, aiSurveyContractIds, 'id')
  return contracts
}

export async function getAiClosingSoonContracts(): Promise<Contract[]> {
  const closingSoonContracts = await api('search-markets-full', {
    term: '',
    sort: 'most-popular',
    filter: 'closing-month',
    limit: 20,
    topicSlug: 'ai', // If you filter by ai slug here
  })

  const aiClosingSoonContracts = (closingSoonContracts as Contract[])
    .filter((c) => c.groupSlugs?.includes('ai'))
    .slice(0, 7)

  return aiClosingSoonContracts
}
// In the future, you can add more functions here for other featured lists.
// For example:
// export async function getAiTrendingContracts(): Promise<Contract[]> { ... }

// export async function getAiHighVolumeContracts(): Promise<Contract[]> { ... }
