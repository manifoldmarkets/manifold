import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { Col } from 'web/components/layout/col'
import { SizedContainer } from 'web/components/sized-container'
import { ProbabilityNeedle } from 'web/components/us-elections/probability-needle'
import { useTracking } from 'web/hooks/use-tracking'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from '../404'

interface ElectionNeedleProps {
  senateControlContract: Contract | null
}

function ElectionNeedle({ senateControlContract }: ElectionNeedleProps) {
  useTracking('view election needle')

  if (!senateControlContract) {
    return <Custom404 />
  }

  // The market resolves YES if Republicans win the Senate, so the Democratic
  // probability (which the needle expects) is the complement.
  const democraticProb =
    1 - getDisplayProbability(senateControlContract as BinaryContract)

  return (
    <Col className="mx-auto w-full max-w-2xl gap-2 p-4">
      <div className="mx-auto font-semibold sm:text-lg">
        Which party will control the Senate?
      </div>
      <SizedContainer className="mx-auto h-[260px] w-full">
        {(width, height) => (
          <ProbabilityNeedle
            percentage={democraticProb}
            width={width}
            height={height}
          />
        )}
      </SizedContainer>
    </Col>
  )
}

export default function ElectionNeedlePage(props: ElectionNeedleProps) {
  return <ElectionNeedle {...props} />
}

export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const senateControlContract = await getContractFromSlug(
    adminDb,
    MIDTERMS_2026.senateControl
  )
  return {
    props: {
      senateControlContract,
    },
    revalidate: 60,
  }
}
