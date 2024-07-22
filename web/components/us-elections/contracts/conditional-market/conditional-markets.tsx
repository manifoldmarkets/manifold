import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PolicyContractType } from 'web/public/data/policy-data'
import { MobilePolicy, Policy } from './conditional-market'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import Image from 'next/image'
import { useLiveContract } from 'web/hooks/use-contract'

export function ConditionalMarkets(props: {
  rawPolicyContracts: PolicyContractType[]
}) {
  const policyContracts = props.rawPolicyContracts.map((policy) => {
    const bidenContract =
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useLiveContract(policy.bidenContract) ?? policy.bidenContract
    const trumpContract =
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useLiveContract(policy.trumpContract) ?? policy.trumpContract

    return {
      title: policy.title,
      bidenContract,
      trumpContract,
    }
  })


  const { shortName: trumpShortName, photo: trumpPhoto } =
    CANDIDATE_DATA['Donald Trump'] ?? {}
  return (
    <Col>
      <Col className="rounded-lg ">
        <Row className=" justify-between  ">
          <Col className="my-auto whitespace-nowrap text-lg font-semibold">
            What will happen if...
          </Col>
          <Row className="hidden text-xs sm:flex">
           
            <Row className="bg-sienna-700 w-[120px] items-center justify-start gap-0.5 rounded-t-lg text-white">
              <Image
                src={trumpPhoto}
                alt={trumpShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill "
              />
              Trump wins
            </Row>
          </Row>
        </Row>
        <div className="sm:bg-canvas-0 rounded-l-lg sm:pl-4">
          {policyContracts.map((policy, index) => (
            <Col key={policy.title}>
              <MobilePolicy policy={policy} className={'sm:hidden'} />
              <Policy
                policy={policy}
                className={'hidden sm:flex'}
                isFirst={index == 0}
                isLast={index == policyContracts.length - 1}
              />
            </Col>
          ))}
        </div>
        <Row className=" w-full justify-end text-xs ">
          <Row className="hidden  sm:flex">
            <Row className="bg-sienna-700 h-2 w-[120px] items-center justify-start gap-0.5 rounded-b-lg text-white" />
          </Row>
        </Row>
      </Col>
    </Col>
  )
}
