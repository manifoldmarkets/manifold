import React, { useMemo, useState } from 'react'
import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'

import { Entry, makeEntries } from '../lib/simulator/entries'
import { Header } from '../components/header'
import { Col } from '../components/layout/col'

function TableBody(props: { entries: Entry[] }) {
  return (
    <tbody>
      {props.entries.map((entry, i) => (
        <tr key={i}>
          <th>{props.entries.length - i}</th>
          <TableRowStart entry={entry} />
          <TableRowEnd entry={entry} />
        </tr>
      ))}
    </tbody>
  )
}

function TableRowStart(props: { entry: Entry }) {
  const { entry } = props
  if (entry.yesBid && entry.noBid) {
    return (
      <>
        <td>
          <div className="badge">ANTE</div>
        </td>
        <td>
          ${entry.yesBid} / ${entry.noBid}
        </td>
      </>
    )
  } else if (entry.yesBid) {
    return (
      <>
        <td>
          <div className="badge badge-success">YES</div>
        </td>
        <td>${entry.yesBid}</td>
      </>
    )
  } else {
    return (
      <>
        <td>
          <div className="badge badge-error">NO</div>
        </td>
        <td>${entry.noBid}</td>
      </>
    )
  }
}

function TableRowEnd(props: { entry: Entry | null; isNew?: boolean }) {
  const { entry } = props
  if (!entry) {
    return (
      <>
        <td>0</td>
        <td>0</td>
        {!props.isNew && (
          <>
            <td>N/A</td>
            <td>N/A</td>
          </>
        )}
      </>
    )
  } else if (entry.yesBid && entry.noBid) {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>N/A</td>
        {!props.isNew && (
          <>
            <td>N/A</td>
            <td>N/A</td>
          </>
        )}
      </>
    )
  } else if (entry.yesBid) {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>${(entry.yesBid + entry.yesWeight).toFixed(0)}</td>
        {!props.isNew && (
          <>
            <td>${entry.yesPayout.toFixed(0)}</td>
            <td>{(entry.yesReturn * 100).toFixed(0)}%</td>
          </>
        )}
      </>
    )
  } else {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>${(entry.noBid + entry.noWeight).toFixed(0)}</td>
        {!props.isNew && (
          <>
            <td>${entry.noPayout.toFixed(0)}</td>
            <td>{(entry.noReturn * 100).toFixed(0)}%</td>
          </>
        )}
      </>
    )
  }
}

function NewBidTable(props: {
  steps: number
  bids: any[]
  setSteps: (steps: number) => void
  setBids: (bids: any[]) => void
}) {
  const { steps, bids, setSteps, setBids } = props
  // Prepare for new bids
  const [newBid, setNewBid] = useState(0)
  const [newBidType, setNewBidType] = useState('YES')

  function makeBid(type: string, bid: number) {
    return {
      yesBid: type == 'YES' ? bid : 0,
      noBid: type == 'YES' ? 0 : bid,
    }
  }

  function submitBid() {
    if (newBid <= 0) return
    const bid = makeBid(newBidType, newBid)
    bids.splice(steps, 0, bid)
    setBids(bids)
    setSteps(steps + 1)
    setNewBid(0)
  }

  function toggleBidType() {
    setNewBidType(newBidType === 'YES' ? 'NO' : 'YES')
  }

  const nextBid = makeBid(newBidType, newBid)
  const fakeBids = [...bids.slice(0, steps), nextBid]
  const entries = makeEntries(fakeBids)
  const nextEntry = entries[entries.length - 1]

  function randomBid() {
    const bidType = Math.random() < 0.5 ? 'YES' : 'NO'
    const p = bidType === 'YES'
      ? nextEntry.prob
      : 1 - nextEntry.prob

    const amount = Math.round(p * Math.random() * 300) + 1
    const bid = makeBid(bidType, amount)

    bids.splice(steps, 0, bid)
    setBids(bids)
    setSteps(steps + 1)
    setNewBid(0)
  }

  return (
    <>
      <table className="table table-compact my-8 w-full text-center">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Type</th>
            <th>Bet</th>
            <th>Prob</th>
            <th>Est Payout</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>{steps + 1}</th>
            <td>
              <div
                className={
                  `badge hover:cursor-pointer ` +
                  (newBidType == 'YES' ? 'badge-success' : 'badge-ghost')
                }
                onClick={toggleBidType}
              >
                YES
              </div>
              <br />
              <div
                className={
                  `badge hover:cursor-pointer ` +
                  (newBidType == 'NO' ? 'badge-error' : 'badge-ghost')
                }
                onClick={toggleBidType}
              >
                NO
              </div>
            </td>
            <td>
              {/* Note: Would love to make this input smaller... */}
              <input
                type="number"
                placeholder="0"
                className="input input-bordered"
                style={{ maxWidth: 100 }}
                value={newBid.toString()}
                onChange={(e) => setNewBid(parseInt(e.target.value) || 0)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter') {
                    submitBid()
                  }
                }}
                onFocus={(e) => e.target.select()}
              />
            </td>

            <TableRowEnd entry={nextEntry} isNew />

            <button
              className="btn btn-primary mt-2"
              onClick={() => submitBid()}
              disabled={newBid <= 0}
            >
              Submit
            </button>
          </tr>
        </tbody>
      </table>

      <button className="btn btn-secondary mb-4" onClick={randomBid}>
        Random bet!
      </button>
    </>
  )
}

// Show a hello world React page
export default function Simulator() {
  const [steps, setSteps] = useState(1)
  const [bids, setBids] = useState([{ yesBid: 550, noBid: 450 }])

  const entries = useMemo(
    () => makeEntries(bids.slice(0, steps)),
    [bids, steps]
  )

  const reversedEntries = [...entries].reverse()

  const probs = entries.map((entry) => entry.prob)
  const points = probs.map((prob, i) => ({ x: i + 1, y: prob * 100 }))
  const data = [{ id: 'Yes', data: points, color: '#11b981' }]
  const tickValues = [0, 25, 50, 75, 100]

  return (
    <Col>
      <Header />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full mt-8 p-2 mx-auto text-center">
        {/* Left column */}
        <div>
          <h1 className="text-2xl font-bold mb-8">
            Dynamic Parimutuel Market Simulator
          </h1>

          <NewBidTable {...{ steps, bids, setSteps, setBids }} />

          {/* History of bids */}
          <div className="overflow-x-auto">
            <table className="table w-full text-center">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Type</th>
                  <th>Bet</th>
                  <th>Prob</th>
                  <th>Est Payout</th>
                  <th>Payout</th>
                  <th>Return</th>
                </tr>
              </thead>

              <TableBody entries={reversedEntries} />
            </table>
          </div>
        </div>

        {/* Right column */}
        <Col>
          <h1 className="text-2xl font-bold mb-8">
            Probability of
            <div className="badge badge-success text-2xl h-8 w-18 ml-3">
              YES
            </div>
          </h1>
          <div className="w-full mb-10" style={{ height: 500 }}>
            <ResponsiveLine
              data={data}
              yScale={{ min: 0, max: 100, type: 'linear' }}
              yFormat={formatPercent}
              gridYValues={tickValues}
              axisLeft={{
                tickValues,
                format: formatPercent,
              }}
              enableGridX={false}
              colors={{ datum: 'color' }}
              pointSize={8}
              pointBorderWidth={1}
              pointBorderColor="#fff"
              enableSlices="x"
              enableArea
              margin={{ top: 20, right: 10, bottom: 20, left: 40 }}
            />
          </div>
          {/* Range slider that sets the current step */}
          <label>Orders # 1 - {steps}</label>
          <input
            type="range"
            className="range"
            min="1"
            max={bids.length}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
          />
        </Col>
      </div>
    </Col>
  )
}

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}
