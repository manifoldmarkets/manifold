import React, { Fragment, useState } from 'react'

import { bids } from './sample-bids'
import { Entry, makeEntries } from './entries'

function toTable(entries: Entry[]) {
  return entries.map((entry, i) => {
    return (
      <tr>
        <th>{i + 1}</th>
        {toRowStart(entry)}
        {toRowEnd(entry)}
      </tr>
    )
  })
}

function toRowStart(entry: Entry) {
  if (entry.yesBid && entry.noBid) {
    return (
      <Fragment>
        <td>
          <div className="badge">SEED</div>
        </td>
        <td>
          {entry.yesBid} / {entry.noBid}
        </td>
      </Fragment>
    )
  } else if (entry.yesBid) {
    return (
      <Fragment>
        <td>
          <div className="badge badge-success">YES</div>
        </td>
        <td>{entry.yesBid}</td>
      </Fragment>
    )
  } else if (entry.noBid) {
    return (
      <Fragment>
        <td>
          <div className="badge badge-error">NO</div>
        </td>
        <td>{entry.noBid}</td>
      </Fragment>
    )
  }
}

function toRowEnd(entry: Entry) {
  if (!entry.yesBid && !entry.noBid) {
    return (
      <Fragment>
        <td>N/A</td>
        <td>N/A</td>
        <td>N/A</td>
        <td>N/A</td>
      </Fragment>
    )
  } else if (entry.yesBid && entry.noBid) {
    return (
      <Fragment>
        <td>N/A</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>N/A</td>
        <td>N/A</td>
      </Fragment>
    )
  } else if (entry.yesBid) {
    return (
      <Fragment>
        <td>{entry.yesWeight.toFixed(2)}</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>{entry.yesPayout.toFixed(2)}</td>
        <td>{(entry.yesReturn * 100).toFixed(2)}%</td>
      </Fragment>
    )
  } else {
    return (
      <Fragment>
        <td>{entry.noWeight.toFixed(2)}</td>
        <td>{entry.prob.toFixed(2)}</td>
        <td>{entry.noPayout.toFixed(2)}</td>
        <td>{(entry.noReturn * 100).toFixed(2)}%</td>
      </Fragment>
    )
  }
}

// Show a hello world React page
export default function Simulator() {
  const [steps, setSteps] = useState(10)

  const entries = makeEntries(bids.slice(0, steps))

  return (
    <div className="overflow-x-auto px-12 mt-8 text-center">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Type</th>
                  <th>Bid</th>
                  <th>Weight</th>
                  <th>Prod</th>
                  <th>Max Payout</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>{toTable(entries)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
