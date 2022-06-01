import { DotsHorizontalIcon, PencilIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { uniqBy } from 'lodash'
import { useState } from 'react'
import { Bet } from 'common/bet'

import { Contract, contractField } from 'common/contract'
import { formatMoney } from 'common/util/format'
import {
  contractPath,
  contractPool,
  getBinaryProbPercent,
  updateContract,
} from 'web/lib/firebase/contracts'
import { AddLiquidityPanel } from '../add-liquidity-panel'
import { CopyLinkButton } from '../copy-link-button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { ShareEmbedButton } from '../share-embed-button'
import { TagsInput } from '../tags-input'
import { Title } from '../title'
import { TweetButton } from '../tweet-button'

const formatTime = (dt: number) => dayjs(dt).format('MMM DD, YYYY hh:mm a z')

export function ContractInfoDialog(props: { contract: Contract; bets: Bet[]; isCreator: boolean }) {
  const { contract, bets, isCreator } = props

  const [open, setOpen] = useState(false)

  const { createdTime, closeTime, resolutionTime, autoResolutionTime, autoResolution } = contract
  const tradersCount = uniqBy(bets, 'userId').length

  return (
    <>
      <button
        className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:cursor-pointer hover:bg-gray-100"
        onClick={() => setOpen(true)}
      >
        <DotsHorizontalIcon
          className={clsx(
            'h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500'
          )}
          aria-hidden="true"
        />
      </button>

      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded bg-white p-6">
          <Title className="!mt-0 !mb-0" text="Market info" />

          <div>Share</div>

          <Row className="justify-start gap-4">
            <CopyLinkButton
              contract={contract}
              toastClassName={'sm:-left-10 -left-4 min-w-[250%]'}
            />
            <TweetButton
              className="self-start"
              tweetText={getTweetText(contract, false)}
            />
            <ShareEmbedButton contract={contract} toastClassName={'-left-20'} />
          </Row>
          <div />

          <div>Stats</div>
          <table className="table-compact table-zebra table w-full text-gray-500">
            <tbody>
              <tr>
                <td>Market created</td>
                <td>{formatTime(createdTime)}</td>
              </tr>

              {closeTime && (
                <tr>
                  <td>Market close{closeTime > Date.now() ? 's' : 'd'}</td>
                  <td>{formatTime(closeTime)}</td>
                </tr>
              )}

              {autoResolutionTime && autoResolution && (
                <>
                  <tr>
                    <td>Automatic resolution</td>
                    <EditableTime
                      time={autoResolutionTime}
                      contract={contract}
                      isCreator={isCreator}
                      dateType='autoResolutionTime'
                    />
                  </tr>
                  <tr>
                  <td>Default resolution</td>
                  <EditableString
                      value={autoResolution}
                      contract={contract}
                      isCreator={isCreator}
                      dateType='autoResolution'
                    />
                </tr>
                </>
              )}

              {resolutionTime && (
                <tr>
                  <td>Market resolved</td>
                  <td>{formatTime(resolutionTime)}</td>
                </tr>
              )}

              <tr>
                <td>Volume</td>
                <td>{formatMoney(contract.volume)}</td>
              </tr>

              <tr>
                <td>Creator earnings</td>
                <td>{formatMoney(contract.collectedFees.creatorFee)}</td>
              </tr>

              <tr>
                <td>Traders</td>
                <td>{tradersCount}</td>
              </tr>

              <tr>
                <td>Pool</td>
                <td>{contractPool(contract)}</td>
              </tr>
            </tbody>
          </table>

          <div>Tags</div>
          <TagsInput contract={contract} />
          <div />

          {contract.mechanism === 'cpmm-1' &&
            !contract.resolution &&
            (!closeTime || closeTime > Date.now()) && (
              <>
                <div className="">Add liquidity</div>
                <AddLiquidityPanel contract={contract} />
              </>
            )}
        </Col>
      </Modal>
    </>
  )
}

const getTweetText = (contract: Contract, isCreator: boolean) => {
  const { question, creatorName, resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const tweetQuestion = isCreator
    ? question
    : `${question}\nAsked by ${creatorName}.`
  const tweetDescription = resolution
    ? `Resolved ${resolution}!`
    : isBinary
    ? `Currently ${getBinaryProbPercent(
        contract
      )} chance, place your bets here:`
    : `Submit your own answer:`

  const timeParam = `${Date.now()}`.substring(7)
  const url = `https://manifold.markets${contractPath(contract)}?t=${timeParam}`

  return `${tweetQuestion}\n\n${tweetDescription}\n\n${url}`
}

export function EditableTime(props: {
  time: number
  contract: Contract
  isCreator: boolean
  dateType: contractField
}) {
  const { time, contract, isCreator, dateType } = props

  const [isEditing, setIsEditing] = useState(false)
  const [timeString, setTimeString] = useState(time && formatTime(time))
  const onSave = () => {
    const newTime = dayjs(timeString).valueOf()
    if (newTime === time) setIsEditing(false)
    else if (newTime > (contract.closeTime ?? Date.now)) {
      updateContract(contract.id, {
        [dateType]: newTime
      })
      setIsEditing(false)
    }
  }

  return (
    <td>
      {isEditing ? (
        <div className="form-control mr-1 items-start">
          <input
            type="datetime-local"
            className="input input-xs"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTimeString(e.target.value || '')}
            min={contract.closeTime}
            value={timeString}
          />
        </div>
      ) : (
        <div className="form-control mr-1 items-start">{timeString}</div>
      )}
      {isCreator &&
        (isEditing ? (
          <button className="btn btn-xs btn-ghost" onClick={onSave}>
            Done
          </button>
        ) : (
          <button className="btn btn-xs btn-ghost"
            onClick={() => setIsEditing(true)}
          >
            <PencilIcon className="mr-2 inline h-4 w-4" /> Edit
          </button>
        ))}
    </td>
  )
}

export function EditableString(props: {
  value: string
  contract: Contract
  isCreator: boolean
  dateType: contractField
}) {
  const { value, contract, isCreator, dateType } = props

  const [isEditing, setIsEditing] = useState(false)
  const [newValue, setTimeString] = useState(value)
  const onSave = () => {
    if (newValue === value) setIsEditing(false)
    else {
      updateContract(contract.id, {
        [dateType]: newValue
      })
      setIsEditing(false)
    }
  }

  return (
    <td>
      {isEditing ? (
          <input
            style={{ maxWidth: 50 }}
            className="input input-xs resize-none"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTimeString(e.target.value || '')}
            min={contract.closeTime}
            value={newValue}
          />
      ) : (
        <>{newValue}</>
      )}
      {isCreator &&
        (isEditing ? (
          <button className="btn btn-xs btn-ghost" onClick={onSave}>
            Done
          </button>
        ) : (
          <button className="btn btn-xs btn-ghost"
            onClick={() => setIsEditing(true)}
          >
            <PencilIcon className="mr-2 inline h-4 w-4" /> Edit
          </button>
        ))}
    </td>
  )
}
