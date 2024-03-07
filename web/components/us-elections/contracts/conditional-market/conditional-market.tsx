import clsx from 'clsx'
import { CPMMBinaryContract, contractPath } from 'common/contract'
import { PolicyContractType } from 'common/politics/policy-data'
import Image from 'next/image'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { track } from '@amplitude/analytics-browser'

export function ConditionalMarketVisual(props: {
  policyContracts: PolicyContractType[]
  className?: string
}) {
  const { policyContracts, className } = props

  const { shortName: joeShortName, photo: joePhoto } =
    CANDIDATE_DATA['Joe Biden'] ?? {}
  const { shortName: trumpShortName, photo: trumpPhoto } =
    CANDIDATE_DATA['Donald Trump'] ?? {}
  return (
    <Col className={className}>
      <div className="mb-2 whitespace-nowrap font-semibold sm:text-lg">
        Conditional Markets
      </div>
      {policyContracts.map((policy) => (
        <MobilePolicy key={policy.title} policy={policy} />
      ))}
    </Col>
  )
}

function MobilePolicy(props: { policy: PolicyContractType }) {
  const { policy } = props
  const { bidenContract, trumpContract, title } = policy
  if (!bidenContract || !trumpContract) {
    return <></>
  }

  const { shortName: joeShortName, photo: joePhoto } =
    CANDIDATE_DATA['Joe Biden'] ?? {}
  const { shortName: trumpShortName, photo: trumpPhoto } =
    CANDIDATE_DATA['Donald Trump'] ?? {}

  const bidenPath = contractPath(bidenContract)
  const trumpPath = contractPath(trumpContract)
  return (
    <Col className="bg-canvas-0 mb-2 rounded-lg px-4 py-2">
      <div className="font-semibold">{title}</div>
      <MobilePolicyRow
        key={policy.title}
        className={'border-ink-300 border-b-[0.5px]'}
        titleContent={
          <Link
            href={bidenPath}
            className="hover:text-primary-700  text-ink-700 hover:underline"
          >
            <Row className="gap-2">
              <Image
                src={joePhoto}
                alt={joeShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill"
              />
              <div className="py-2">If Biden wins</div>
            </Row>
          </Link>
        }
        sideContent1={
          <ContractStatusLabel
            contract={bidenContract}
            className="h-full w-10 font-semibold"
          />
        }
        sideContent2={
          <BinaryBetButton contract={bidenContract as CPMMBinaryContract} />
        }
      />
      <MobilePolicyRow
        key={policy.title}
        titleContent={
          <Link
            href={trumpPath}
            className="hover:text-primary-700 text-ink-700 py-2 hover:underline"
          >
            <Row className="gap-2">
              <Image
                src={trumpPhoto}
                alt={trumpShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill"
              />
              <div className="py-2">If Trump wins</div>
            </Row>
          </Link>
        }
        sideContent1={
          <ContractStatusLabel
            contract={trumpContract}
            className="my-auto h-full w-10 font-semibold"
          />
        }
        sideContent2={
          <BinaryBetButton contract={trumpContract as CPMMBinaryContract} />
        }
      />
    </Col>
  )
}

export function MobilePolicyRow(props: {
  titleContent: ReactNode
  sideContent1: ReactNode
  sideContent2: ReactNode
  className?: string
}) {
  const { titleContent, sideContent1, sideContent2, className } = props
  return (
    <Row className={clsx('gap-0.5', className)}>
      <div className="grow">{titleContent}</div>
      <div className="h-full w-12 shrink-0 items-center py-2">
        {sideContent1}
      </div>
      <div className=" h-full w-12 shrink-0 items-center py-2">
        {sideContent2}
      </div>
    </Row>
  )
}

export const BinaryBetButton = (props: { contract: CPMMBinaryContract }) => {
  const { contract } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const user = useUser()

  function closePanel() {
    setOutcome(undefined)
  }

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS)}
      >
        <Link
          className={clsx(
            'hover:text-primary-700 mb-4 grow items-start font-semibold transition-colors hover:underline sm:text-lg'
          )}
          href={contractPath(contract)}
        >
          {contract.question}
        </Link>
        <BuyPanel
          contract={contract}
          user={user}
          initialOutcome={outcome}
          onCancel={closePanel}
          onBuySuccess={() => setTimeout(closePanel, 500)}
          location={'contract page answer'}
          inModal={true}
          alwaysShowOutcomeSwitcher
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className="bg-primary-50 h-fit w-fit"
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'binary panel' })
          setOutcome('YES')
        }}
      >
        Bet
      </Button>
    </>
  )
}
