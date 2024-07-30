import { GetStaticProps } from 'next'
import { MultiContract } from 'common/contract'
import { PoliticsCard } from 'web/components/us-elections/contracts/politics-card'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import { useTracking } from 'web/hooks/use-tracking'

interface ElectionNeedleProps {
  electionPartyContract: MultiContract
}

function ElectionNeedle({ electionPartyContract }: ElectionNeedleProps) {
  useTracking('view election needle')

  return (
    <PoliticsCard
      contract={electionPartyContract}
      viewType="PARTY"
      customTitle="Which party will win the Presidential Election?"
    />
  )
}

export default function ElectionNeedlePage({
  electionPartyContract,
}: ElectionNeedleProps) {
  return <ElectionNeedle electionPartyContract={electionPartyContract} />
}

export const getStaticProps: GetStaticProps<ElectionNeedleProps> = async () => {
  try {
    const electionsPageProps: ElectionsPageProps = await getElectionsPageProps()

    if (!electionsPageProps.electionPartyContract) {
      return { notFound: true }
    }

    return {
      props: {
        electionPartyContract:
          electionsPageProps.electionPartyContract as MultiContract,
      },
      revalidate: 60, // Revalidate every 60 seconds
    }
  } catch (error) {
    console.error('Error fetching election party contract:', error)
    return { notFound: true }
  }
}
