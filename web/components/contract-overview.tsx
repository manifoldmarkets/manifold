import { useState } from 'react'
import {
  compute,
  Contract,
  deleteContract,
  setContract,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import router from 'next/router'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import dayjs from 'dayjs'
import { Linkify } from './linkify'
import clsx from 'clsx'
import { ContractDetails, ResolutionOrChance } from './contract-card'

function ContractCloseTime(props: { contract: Contract }) {
  const closeTime = props.contract.closeTime
  if (!closeTime) {
    return null
  }
  return (
    <div className="text-gray-500 text-sm">
      Trading {closeTime > Date.now() ? 'closes' : 'closed'} at{' '}
      {dayjs(closeTime).format('MMM D, h:mma')}
    </div>
  )
}

function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
}) {
  const { contract, isCreator } = props
  const [editing, setEditing] = useState(false)
  const editStatement = () => `${dayjs().format('MMM D, h:mma')}: `
  const [description, setDescription] = useState(editStatement())

  // Append the new description (after a newline)
  async function saveDescription(e: any) {
    e.preventDefault()
    setEditing(false)
    contract.description = `${contract.description}\n${description}`.trim()
    await setContract(contract)
    setDescription(editStatement())
  }

  return (
    <div className="whitespace-pre-line break-words">
      <Linkify text={contract.description} />
      <br />
      {isCreator &&
        !contract.resolution &&
        (editing ? (
          <form className="mt-4">
            <textarea
              className="textarea h-24 textarea-bordered w-full mb-2"
              value={description}
              onChange={(e) => setDescription(e.target.value || '')}
              autoFocus
              onFocus={(e) =>
                // Focus starts at end of description.
                e.target.setSelectionRange(
                  description.length,
                  description.length
                )
              }
            />
            <Row className="gap-4 justify-end">
              <button
                className="btn btn-error btn-outline btn-sm mt-2"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-neutral btn-outline btn-sm mt-2"
                onClick={saveDescription}
              >
                Save
              </button>
            </Row>
          </form>
        ) : (
          <Row className="justify-end">
            <button
              className="btn btn-neutral btn-outline btn-sm mt-4"
              onClick={() => setEditing(true)}
            >
              Add to description
            </button>
          </Row>
        ))}
    </div>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { resolution, creatorId } = contract
  const { probPercent, truePool } = compute(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4">
        <Col className="gap-4">
          <div className="text-2xl md:text-3xl text-indigo-700">
            <Linkify text={contract.question} />
          </div>

          <ResolutionOrChance
            className="md:hidden"
            resolution={resolution}
            probPercent={probPercent}
            large
          />

          <ContractDetails contract={contract} />
        </Col>

        <ResolutionOrChance
          className="hidden md:flex md:items-end"
          resolution={resolution}
          probPercent={probPercent}
          large
        />
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      <ContractCloseTime contract={contract} />

      <Spacer h={4} />

      {((isCreator && !contract.resolution) || contract.description) && (
        <label className="text-gray-500 mb-2 text-sm">Description</label>
      )}

      <ContractDescription contract={contract} isCreator={isCreator} />

      {/* Show a delete button for contracts without any trading */}
      {isCreator && truePool === 0 && (
        <>
          <Spacer h={8} />
          <button
            className="btn btn-xs btn-error btn-outline mt-1 max-w-fit self-end"
            onClick={async (e) => {
              e.preventDefault()
              await deleteContract(contract.id)
              router.push('/markets')
            }}
          >
            Delete
          </button>
        </>
      )}
    </Col>
  )
}
