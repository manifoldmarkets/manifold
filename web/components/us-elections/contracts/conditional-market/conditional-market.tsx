import clsx from 'clsx'
import {
  BinaryContract,
  CPMMBinaryContract,
  Contract,
  contractPath,
} from 'common/contract'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { track } from '@amplitude/analytics-browser'
import { PolicyContractType } from 'web/public/data/policy-data'
import { getDisplayProbability } from 'common/calculate'
import { GoTriangleUp } from 'react-icons/go'
import { getPercent } from 'common/util/format'
import { ClickFrame } from 'web/components/widgets/click-frame'
import Router from 'next/router'

export function Policy(props: {
  policy: PolicyContractType
  className?: string
  isFirst: boolean
  isLast: boolean
}) {
  const { policy, className, isFirst, isLast } = props
  const { bidenContract, trumpContract, title } = policy
  if (!bidenContract || !trumpContract) {
    return <></>
  }

  const bidenPath = contractPath(bidenContract)
  const trumpPath = contractPath(trumpContract)

  const bidenProbability = getPercent(
    getDisplayProbability(bidenContract as BinaryContract)
  ).toFixed(0)

  const trumpProbability = getPercent(
    getDisplayProbability(trumpContract as BinaryContract)
  ).toFixed(0)

  return (
    <Row
      className={clsx(
        ' border-ink-300 w-full justify-between',
        !isLast && 'border-b',
        className
      )}
    >
      <Row className="border-ink-300 w-full items-center">{title}</Row>
      <Row className="items-center">
        <ConditionalPercent
          path={bidenPath}
          contract={bidenContract}
          className="bg-azure-500/20 dark:bg-azure-500/10 items-center justify-center py-2"
          isLargerPercent={bidenProbability > trumpProbability}
        />
        <ConditionalPercent
          path={trumpPath}
          contract={trumpContract}
          className="bg-sienna-500/20 dark:bg-sienna-500/10 justify-end  px-4 py-2"
          isLargerPercent={trumpProbability > bidenProbability}
        />
      </Row>
    </Row>
  )
}

function ConditionalPercent(props: {
  path: string
  contract: Contract
  className?: string
  isLargerPercent?: boolean
}) {
  const { path, contract, className, isLargerPercent = false } = props
  return (
    <ClickFrame
      className={clsx(
        className,
        'text-ink-700 group flex h-full w-[120px] flex-row items-center gap-2'
      )}
      onClick={(e) => {
        Router.push(path)
      }}
    >
      <Row>
        {isLargerPercent ? (
          <GoTriangleUp className="text-ink-400 dark:text-ink-500 my-auto h-4 w-4" />
        ) : (
          <div className="h-4 w-4" />
        )}
        <ContractStatusLabel
          contract={contract}
          className={clsx(
            isLargerPercent && 'font-bold',
            'group-hover:text-primary-700 w-10 transition-colors'
          )}
        />
      </Row>
      <BinaryBetButton contract={contract as CPMMBinaryContract} />
    </ClickFrame>
  )
}

export function MobilePolicy(props: {
  policy: PolicyContractType
  className?: string
}) {
  const { policy, className } = props
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

  const bidenProbability = getPercent(
    getDisplayProbability(bidenContract as BinaryContract)
  ).toFixed(0)

  const trumpProbability = getPercent(
    getDisplayProbability(trumpContract as BinaryContract)
  ).toFixed(0)

  return (
    <Col className={clsx('bg-canvas-0 mb-2 rounded-lg px-4 py-2', className)}>
      <div className="font-semibold">{title}</div>
      <Row
        className={clsx('border-ink-300 gap-0.5 border-b-[0.5px]', className)}
      >
        <div className="grow">
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
              <div className="py-2">Biden wins</div>
            </Row>
          </Link>
        </div>
        <ConditionalPercent
          path={bidenPath}
          contract={bidenContract}
          className="  items-center justify-center py-2"
          isLargerPercent={bidenProbability > trumpProbability}
        />
      </Row>
      <Row className={clsx(' gap-0.5', className)}>
        <div className="grow">
          <Link
            href={bidenPath}
            className="hover:text-primary-700  text-ink-700 hover:underline"
          >
            <Row className="gap-2">
              <Image
                src={trumpPhoto}
                alt={trumpShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill"
              />
              <div className="py-2">Trump wins</div>
            </Row>
          </Link>
        </div>
        <ConditionalPercent
          path={trumpPath}
          contract={trumpContract}
          className="  items-center justify-center py-2"
          isLargerPercent={trumpProbability > bidenProbability}
        />
      </Row>
    </Col>
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
