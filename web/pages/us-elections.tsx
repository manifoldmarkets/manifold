import { Contract } from 'common/contract'
import { ELECTION_ENABLED } from 'common/envs/constants'
import { getContractFromSlug } from 'common/supabase/contracts'
import { useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { PoliticsContractCard } from 'web/components/us-elections/contracts/politics-contract-card'
import { presidency2024 } from 'web/components/us-elections/usa-map/election-contract-data'
import { probToColor } from 'web/components/us-elections/usa-map/state-election-map'
import {
  ClickHandler,
  Customize,
  USAMap,
} from 'web/components/us-elections/usa-map/usa-map'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from './404'

export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()

  const mapContractsPromises = presidency2024.map((m) =>
    getContractFromSlug(m.slug, adminDb).then((contract) => {
      return { state: m.state, contract: contract }
    })
  )

  // Wait for all promises to resolve
  const mapContracts = await Promise.all(mapContractsPromises)

  return {
    props: {
      mapContracts: mapContracts,
    },
  }
}

export type MapContracts = { state: string; contract: Contract | null }

export default function USElectionsPage(props: {
  mapContracts: MapContracts[]
}) {
  const { mapContracts } = props
  const [targetContract, setTargetContract] = useState<
    Contract | undefined | null
  >(undefined)

  const stateContractMap: Customize = useMemo(() => {
    const map: Record<
      string,
      {
        fill: string
        clickHandler: ClickHandler
        selected: boolean | undefined
      }
    > = {}
    mapContracts.forEach((mapContract) => {
      map[mapContract.state] = {
        fill: probToColor(mapContract.contract) ?? '#D6D1D3',
        clickHandler: () => {
          if (
            targetContract &&
            mapContract.contract?.id === targetContract.id
          ) {
            setTargetContract(undefined)
          } else {
            setTargetContract(mapContract.contract)
          }
        },
        selected: targetContract?.id === mapContract.contract?.id,
      }
    })
    return map
  }, [mapContracts, targetContract])

  if (!ELECTION_ENABLED) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="us elections page 2024">
      <Col className="gap-3">
        <USAMap customize={stateContractMap} />
        {targetContract && <PoliticsContractCard contract={targetContract} />}
      </Col>
    </Page>
  )
}
