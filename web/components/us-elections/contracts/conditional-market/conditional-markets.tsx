import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { PolicyContractType } from 'web/public/data/policy-data'
import { MobilePolicy, Policy } from './conditional-market'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import Image from 'next/image'

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
    <Col>
      <div className="whitespace-nowrap font-semibold sm:text-lg">
        What will happen if...
      </div>
      <Col className="rounded-lg py-2">
        <Row className="text-ink-500 mb-1 hidden justify-between text-sm sm:flex">
          Event
          <Row className="gap-4">
            <Row className="w-[98px] justify-start">Biden wins</Row>
            <Row className=" w-[98px] justify-start ">Trump wins</Row>
          </Row>
        </Row>
        {policyContracts.map((policy, index) => (
          <>
            <MobilePolicy
              key={policy.title}
              policy={policy}
              className={'sm:hidden'}
            />
            <Policy
              key={policy.title}
              policy={policy}
              className={'hidden sm:flex'}
              isFirst={index == 0}
              isLast={index == policyContracts.length - 1}
            />
          </>
        ))}
      </Col>
    </Col>
  )
}
