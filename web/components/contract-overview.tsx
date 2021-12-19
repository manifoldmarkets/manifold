import { Fragment, useState } from 'react'
import {
  compute,
  Contract,
  deleteContract,
  setContract,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { ContractDetails } from './contracts-list'
import router from 'next/router'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import dayjs from 'dayjs'
import Link from 'next/link'

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

  // Return a JSX span, linkifying @username, #hashtags, and https://...
  function Linkify(props: { text: string }) {
    const { text } = props
    const regex = /(?:^|\s)(?:[@#][a-z0-9_]+|https?:\/\/\S+)/gi
    const matches = text.match(regex) || []
    const links = matches.map((match) => {
      // Matches are in the form: " @username" or "https://example.com"
      const whitespace = match.match(/^\s/)
      const symbol = match.trim().substring(0, 1)
      const tag = match.trim().substring(1)
      const href =
        {
          '@': `/${tag}`,
          '#': `/tag/${tag}`,
        }[symbol] ?? match

      return (
        <>
          {whitespace}
          <Link href={href}>
            <a className="text-indigo-700 hover:underline hover:decoration-2">
              {symbol}
              {tag}
            </a>
          </Link>
        </>
      )
    })
    return (
      <span>
        {text.split(regex).map((part, i) => (
          <Fragment key={i}>
            {part}
            {links[i]}
          </Fragment>
        ))}
      </span>
    )
  }

  return (
    <div className="whitespace-pre-line">
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
  const { probPercent, volume } = compute(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[contract.resolution || '']

  return (
    <Col className={className}>
      <Col className="justify-between md:flex-row">
        <Col>
          <div className="text-3xl text-indigo-700 mb-4">
            {contract.question}
          </div>

          <ContractDetails contract={contract} />
        </Col>

        {resolution ? (
          <Col className="text-4xl mt-8 md:mt-0 md:ml-4 md:mr-6 items-end self-center md:self-start">
            <div className="text-xl text-gray-500">Resolved</div>
            <div className={resolutionColor}>
              {resolution === 'CANCEL' ? 'N/A' : resolution}
            </div>
          </Col>
        ) : (
          <Col className="text-4xl mt-8 md:mt-0 md:ml-4 md:mr-6 text-primary items-end self-center md:self-start">
            {probPercent}
            <div className="text-xl">chance</div>
          </Col>
        )}
      </Col>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      {((isCreator && !contract.resolution) || contract.description) && (
        <label className="text-gray-500 mb-2 text-sm">Description</label>
      )}
      <ContractDescription contract={contract} isCreator={isCreator} />

      {/* Show a delete button for contracts without any trading */}
      {isCreator && volume === 0 && (
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
