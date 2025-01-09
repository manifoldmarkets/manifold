import { Contract } from 'common/contract'
import { api } from 'web/lib/api/api'
import { getContract, getContracts } from '../../common/src/supabase/contracts'
import { db } from 'web/lib/supabase/db'

export const aiSurveyContractIds = [
  '9cy09yhQd2',
  'hRU0NuZhSy',
  'AELz6Q2usA',
  'EzN2u8OQq2',
  'Uul0EZt0td',
  'z8sPq6NSqQ',
  'dL2Rl06NUI',
  'EQqSEhAuOd',
  'Uu5q0usuQg',
]

export const shortAiBenchmarkContractIds = [
  'CkzcqS69tr1hOS56mjZY',
  '4cobxeU2KSBo5BPSFCKe',
  'tXYiojNCLmLSJVfGUGK5',
  'hhnUhg5pty',
  'SfBHzKtfZhIqeV2gcLuZ',
  'BcJbQTDX1rdmaLYGKUOz',
  'osbD00CDUgcQGPHhH0mn',
  '7yaoogxozx',
]

export const longAiBenchmarkContractIds = [
  'dI5U6ps6IP',
  'DKWUoTfIrbxHwQloZLG3',
  'j7IOXyBOzFiYHtVFXWP3',
  'Red8L367S1DreBesRRu3',
  'ymaev6DmK5AlzKdaTqOt',
  'HJdflF0LTJwPNKQmaf6G',
]

export const aiPolicyContractIds = [
  '0YCYyjBNcZ2XW9Qer4sD',
  'Twyw0JCFW7VXfa4vl0d6',
  'zo6v3r95mq',
  'PEAh4AsufK9Xdy8kKker',
  'Lb3FC1lLBtU5KySEbVzJ',
  'Uxu9dll7SdYVTGUEmebV',
  'p83DN95Vy7eQPXRsSgpR',
  'U58ue9CkiHRqrgmPlr0S',
  'DKtHVhTHJu2lcEfwmnlP',
  '0odd65dzft',
  'QuNoQ7wHgdFBetB3K4jT',
  'g6Cz8nQZy5',
  '8wp0xc905e',
]

export const aiCompaniesContractIds = [
  'uA88Oc5Uqs',
  '5M2I0YYBYCstkwDI3yDK',
  'BmK6wCA9ol7sjaqB9ZGt',
  'rALUJE3xQLyBEGoW1j9Q',
  'C8MtRn2ixX8Y0rV2Oqcy',
  'h6yuo5ag84',
  'lp17jc8bxl',
  'iz2ovejkv3',
  'UpfNoFH6Q6sU3HAZ2SzR',
  'RB1446KxI8aNMAiaIEDl',
  'a9QwFRF9xYWbjhGi4dde',
  '1m08c366fh',
]

export async function getAiContracts(): Promise<{
  surveyContracts: Contract[]
  closingSoonContracts: Contract[]
  shortBenchmarks: Contract[]
  longBenchmarks: Contract[]
  aiPolicyContracts: Contract[]
  aiCompaniesContracts: Contract[]
  recentActivityContracts: Contract[]
  justResolvedContracts: Contract[]
  newAiModel: Contract | null
}> {
  const fetchContractsByIds = async (ids: string[]): Promise<Contract[]> => {
    const contracts = await Promise.all(ids.map((id) => getContract(db, id)))
    return contracts.filter((c): c is Contract => c !== null)
  }

  const [
    surveyContracts,
    closingSoonContracts,
    shortBenchmarks,
    longBenchmarks,
    aiPolicyContracts,
    aiCompaniesContracts,
    recentActivityContracts,
    justResolvedContracts,
    newAiModel,
  ] = await Promise.all([
    getContracts(db, aiSurveyContractIds, 'id'),
    api('search-markets-full', {
      term: '',
      sort: 'most-popular',
      filter: 'closing-month',
      limit: 7,
      gids: 'yEWvvwFFIqzf8JklMewp',
    }),
    fetchContractsByIds(shortAiBenchmarkContractIds),
    fetchContractsByIds(longAiBenchmarkContractIds),
    fetchContractsByIds(aiPolicyContractIds),
    fetchContractsByIds(aiCompaniesContractIds),
    api('search-markets-full', {
      term: '',
      sort: 'last-updated',
      filter: 'open',
      limit: 7,
      gids: 'yEWvvwFFIqzf8JklMewp',
    }),
    api('search-markets-full', {
      term: '',
      sort: 'resolve-date',
      filter: 'all',
      limit: 7,
      gids: 'yEWvvwFFIqzf8JklMewp',
    }),
    getContract(db, 'sPsE8AZl06'), // New AI Model releases, update monthly with new contract
  ])

  return {
    surveyContracts,
    closingSoonContracts,
    shortBenchmarks,
    longBenchmarks,
    aiPolicyContracts,
    aiCompaniesContracts,
    recentActivityContracts,
    justResolvedContracts,
    newAiModel,
  }
}
