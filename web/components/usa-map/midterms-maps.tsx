import { useEffect } from 'react'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { StateElectionMap } from './state-election-map'
import { useState } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { CPMMBinaryContract } from 'common/contract'
import { senateMidterms, governorMidterms } from 'web/pages/midterms'

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
