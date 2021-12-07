import React, { useEffect, useMemo, useState } from 'react'
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
import { ChartData } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { bids as sampleBids } from './sample-bids'
import { Entry, makeEntries } from './entries'

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
          <th>{i + 1}</th>
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
          <div className="badge">SEED</div>
        </td>
        <td>
          {entry.yesBid} / {entry.noBid}
        </td>
      </>
    )
  } else if (entry.yesBid) {
    return (
      <>
        <td>
          <div className="badge badge-success">YES</div>
        </td>
        <td>{entry.yesBid}</td>
      </>
    )
  } else {
    return (
      <>
        <td>
          <div className="badge badge-error">NO</div>
        </td>
        <td>{entry.noBid}</td>
      </>
    )
  }
}

function TableRowEnd(props: { entry: Entry | null }) {
  const { entry } = props
  if (!entry) {
    return (
      <>
        <td>N/A</td>
        <td>N/A</td>
        <td>N/A</td>
        <td>N/A</td>
      </>
    )
  } else if (entry.yesBid && entry.noBid) {
    return (
      <>
        <td>N/A</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>N/A</td>
        <td>N/A</td>
      </>
    )
  } else if (entry.yesBid) {
    return (
      <>
        <td>{entry.yesWeight.toFixed(2)}</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>{entry.yesPayout.toFixed(2)}</td>
        <td>{(entry.yesReturn * 100).toFixed(2)}%</td>
      </>
    )
  } else {
    return (
      <>
        <td>{entry.noWeight.toFixed(2)}</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>{entry.noPayout.toFixed(2)}</td>
        <td>{(entry.noReturn * 100).toFixed(2)}%</td>
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

  const nextEntry = useMemo(() => {
    if (newBid) {
      const nextBid = makeBid(newBidType, newBid)
      const fakeBids = [...bids.slice(0, steps), nextBid]
      const entries = makeEntries(fakeBids)
      return entries[entries.length - 1]
    }
    return null
  }, [newBid, newBidType, steps])

  return (
    <table className="table table-compact my-8 w-full">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Type</th>
          <th>Bid</th>
          <th>Weight</th>
          <th>Probability</th>
          <th>Payout</th>
          <th>Return</th>
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
            <input
              type="number"
              placeholder="0"
              className="input input-bordered"
              value={newBid}
              onChange={(e) => setNewBid(parseInt(e.target.value) || 0)}
              onKeyUp={(e) => {
                if (e.key === 'Enter') {
                  submitBid()
                }
              }}
              onFocus={(e) => e.target.select()}
            />
          </td>
          <TableRowEnd entry={nextEntry} />
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
  )
}

// Show a hello world React page
export default function Simulator() {
  const [steps, setSteps] = useState(10)
  const [bids, setBids] = useState(sampleBids)

  const entries = useMemo(
    () => makeEntries(bids.slice(0, steps)),
    [bids, steps]
  )
  const probs = entries.map((entry) => entry.prob)

  // Set up chart
  const [chartData, setChartData] = useState({ datasets: [] } as ChartData)

  useEffect(() => {
    setChartData({
      labels: Array.from({ length: steps }, (_, i) => i + 1),
      datasets: [
        {
          label: 'Implied probability',
          data: probs,
          borderColor: 'rgb(75, 192, 192)',
        },
      ],
    })
  }, [steps])

  return (
    <div className="overflow-x-auto px-12 mt-8 text-center">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left column */}
        <div>
          <h1 className="text-2xl font-bold text-gray-600 mb-8">
            Dynamic Parimutuel Market Simulator
          </h1>
          {/* Range slider that sets the current step */}
          <label>Simulation step: {steps}</label>
          <input
            type="range"
            className="range"
            min="1"
            max={bids.length}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
          />

          <NewBidTable {...{ steps, bids, setSteps, setBids }} />

          {/* History of bids */}
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Type</th>
                  <th>Bid</th>
                  <th>Weight</th>
                  <th>Prob</th>
                  <th>Max Payout</th>
                  <th>Return</th>
                </tr>
              </thead>

              <TableBody entries={entries} />
            </table>
          </div>
        </div>

        {/* Right column */}
        <div>
          <h1 className="text-2xl font-bold text-gray-600 mb-8">
            Probability of
            <div className="badge badge-success text-2xl h-8 w-18">YES</div>
          </h1>
          <Line data={chartData} height={200} />
        </div>
      </div>
    </div>
  )
}
