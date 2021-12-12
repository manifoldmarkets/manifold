import React, { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

import { Entry, makeEntries } from '../../lib/simulator/entries'
import { Header } from '../../components/header'

// Auto import doesn't work for some reason...
// So we manually register ChartJS components instead:
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

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

function TableRowEnd(props: { entry: Entry | null, isNew?: boolean }) {
  const { entry } = props
  if (!entry) {
    return (
      <>
        <td>0</td>
        <td>0</td>
        {!props.isNew && <>
          <td>N/A</td>
          <td>N/A</td>
        </>}
      </>
    )
  } else if (entry.yesBid && entry.noBid) {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>N/A</td>
        {!props.isNew && <>
          <td>N/A</td>
          <td>N/A</td>
        </>}
      </>
    )
  } else if (entry.yesBid) {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>${(entry.yesBid + entry.yesWeight).toFixed(0)}</td>
        {!props.isNew && <>
          <td>${entry.yesPayout.toFixed(0)}</td>
          <td>{(entry.yesReturn * 100).toFixed(0)}%</td>
        </>}
      </>
    )
  } else {
    return (
      <>
        <td>{(entry.prob * 100).toFixed(1)}%</td>
        <td>${(entry.noBid + entry.noWeight).toFixed(0)}</td>
        {!props.isNew && <>
          <td>${entry.noPayout.toFixed(0)}</td>
          <td>{(entry.noReturn * 100).toFixed(0)}%</td>
        </>}
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
    const bidType = Math.random() < 0.5
      ? 'YES'
      : 'NO'
    const amount = Math.round(Math.random() * 500)
    const bid = makeBid(bidType, amount)

    bids.splice(steps, 0, bid)
    setBids(bids)
    setSteps(steps + 1)
    setNewBid(0)
  }

  return <>
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

          <TableRowEnd
            entry={nextEntry}
            isNew
          />

          <td>
            <button
              className="btn btn-primary"
              onClick={() => submitBid()}
              disabled={newBid <= 0}
            >
              Submit
            </button>

          </td>
        </tr>
      </tbody>
    </table>

    <button
      className="btn btn-secondary mb-4"
      onClick={randomBid}
    >
      Random bet!
    </button>
  </>
}

// Show a hello world React page
export default function Simulator() {
  const [steps, setSteps] = useState(1)
  const [bids, setBids] = useState([{ yesBid: 600, noBid: 400 }])

  const entries = useMemo(
    () => makeEntries(bids.slice(0, steps)),
    [bids, steps]
  )

  const reversedEntries = [...entries].reverse()

  const probs = entries.map((entry) => entry.prob)

  const chartData = {
    labels: Array.from({ length: steps }, (_, i) => 1 + i),
    datasets: [
      {
        label: 'Implied probability',
        data: probs,
        borderColor: 'rgb(75, 192, 192)',
      },
    ],
  }

  return (
    <div>
      <Header />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-8 max-w-7xl mx-auto text-center">
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
        <div>
          <h1 className="text-2xl font-bold mb-8">
            Probability of
            <div className="badge badge-success text-2xl h-8 w-18">YES</div>
          </h1>
          <Line data={chartData} height={200} />
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
        </div>
      </div>
    </div>
  )
}
