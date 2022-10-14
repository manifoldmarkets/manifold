import { useEffect } from 'react'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { StateElectionMap, StateElectionMarket } from './state-election-map'
import { useState } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { CPMMBinaryContract } from 'common/contract'

export function MidtermsMaps(props: { mapType: string }) {
  const { mapType } = props
  const [contracts, setContracts] = useState<CPMMBinaryContract[] | null>(null)

  useEffect(() => {
    const getContracts = async () => {
      if (props.mapType === 'senate') {
        const senateContracts = await Promise.all(
          senateMidterms.map((m) =>
            getContractFromSlug(m.slug).then((c) => c ?? null)
          )
        )
        setContracts(senateContracts as CPMMBinaryContract[])
      } else if (props.mapType === 'governor') {
        const governorContracts = await Promise.all(
          governorMidterms.map((m) =>
            getContractFromSlug(m.slug).then((c) => c ?? null)
          )
        )
        setContracts(governorContracts as CPMMBinaryContract[])
      }
    }
    getContracts()
  }, [props.mapType, setContracts])

  return contracts ? (
    <StateElectionMap
      markets={mapType == 'senate' ? senateMidterms : governorMidterms}
      contracts={contracts}
    />
  ) : (
    <LoadingIndicator />
  )
}

const senateMidterms: StateElectionMarket[] = [
  {
    state: 'AZ',
    creatorUsername: 'BTE',
    slug: 'will-blake-masters-win-the-arizona',
    isWinRepublican: true,
  },
  {
    state: 'OH',
    creatorUsername: 'BTE',
    slug: 'will-jd-vance-win-the-ohio-senate-s',
    isWinRepublican: true,
  },
  {
    state: 'WI',
    creatorUsername: 'BTE',
    slug: 'will-ron-johnson-be-reelected-in-th',
    isWinRepublican: true,
  },
  {
    state: 'FL',
    creatorUsername: 'BTE',
    slug: 'will-marco-rubio-be-reelected-to-th',
    isWinRepublican: true,
  },
  {
    state: 'PA',
    creatorUsername: 'MattP',
    slug: 'will-dr-oz-be-elected-to-the-us-sen',
    isWinRepublican: true,
  },
  {
    state: 'GA',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-3d2432ba6d79',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen',
    isWinRepublican: false,
  },
  {
    state: 'NC',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-6f1a901e1fcf',
    isWinRepublican: false,
  },
  {
    state: 'NH',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-23194a72f1b7',
    isWinRepublican: false,
  },
  {
    state: 'UT',
    creatorUsername: 'SG',
    slug: 'will-mike-lee-win-the-2022-utah-sen',
    isWinRepublican: true,
  },
  {
    state: 'CO',
    creatorUsername: 'SG',
    slug: 'will-michael-bennet-win-the-2022-co',
    isWinRepublican: false,
  },
]

const governorMidterms: StateElectionMarket[] = [
  {
    state: 'TX',
    creatorUsername: 'LarsDoucet',
    slug: 'republicans-will-win-the-2022-texas',
    isWinRepublican: true,
  },
  {
    state: 'GA',
    creatorUsername: 'MattP',
    slug: 'will-stacey-abrams-win-the-2022-geo',
    isWinRepublican: false,
  },
  {
    state: 'FL',
    creatorUsername: 'Tetraspace',
    slug: 'if-charlie-crist-is-the-democratic',
    isWinRepublican: false,
  },
  {
    state: 'PA',
    creatorUsername: 'JonathanMast',
    slug: 'will-josh-shapiro-win-the-2022-penn',
    isWinRepublican: false,
  },
  {
    state: 'PA',
    creatorUsername: 'JonathanMast',
    slug: 'will-josh-shapiro-win-the-2022-penn',
    isWinRepublican: false,
  },
  {
    state: 'CO',
    creatorUsername: 'ScottLawrence',
    slug: 'will-jared-polis-be-reelected-as-co',
    isWinRepublican: false,
  },
  {
    state: 'OR',
    creatorUsername: 'Tetraspace',
    slug: 'if-tina-kotek-is-the-2022-democrati',
    isWinRepublican: false,
  },
  {
    state: 'MD',
    creatorUsername: 'Tetraspace',
    slug: 'if-wes-moore-is-the-2022-democratic',
    isWinRepublican: false,
  },
  {
    state: 'AK',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-alas',
    isWinRepublican: true,
  },
  {
    state: 'AZ',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-ariz',
    isWinRepublican: true,
  },
  {
    state: 'AZ',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-ariz',
    isWinRepublican: true,
  },
  {
    state: 'WI',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-wiscon',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-nevada',
    isWinRepublican: false,
  },
  {
    state: 'KS',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-kansas',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-new-me',
    isWinRepublican: false,
  },
  {
    state: 'ME',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-maine',
    isWinRepublican: false,
  },
]
