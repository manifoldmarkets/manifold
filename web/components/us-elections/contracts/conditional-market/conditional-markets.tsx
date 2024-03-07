import { PolicyContractType } from 'common/politics/policy-data'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { ConditionalMarketVisual } from './conditional-market'

export function ConditionalMarkets(props: {
  rawPolicyContracts: PolicyContractType[]
}) {
  const policyContracts = props.rawPolicyContracts.map((policy) => {
    const bidenContract = policy.bidenContract
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useFirebasePublicContract(
          policy.bidenContract.visibility,
          policy.bidenContract.id
        )
      : policy.bidenContract
    const trumpContract = policy.trumpContract
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useFirebasePublicContract(
          policy.trumpContract.visibility,
          policy.trumpContract.id
        )
      : policy.trumpContract

    return {
      title: policy.title,
      bidenContract,
      trumpContract,
    }
  })
  return (
    <>
      <ConditionalMarketVisual policyContracts={policyContracts} />
    </>
  )
}
