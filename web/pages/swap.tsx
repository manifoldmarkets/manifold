import {
  calculateLPCost,
  fromProb,
  getSwap3Probability,
  Swap3Pool,
} from 'common/calculate-swap3'
import { formatPercent } from 'common/util/format'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

const users = {
  alice: {
    M: 100,
    YES: 0,
    NO: 0,
  },
  bob: {
    M: 200,
    YES: 0,
    NO: 0,
  },
  kipply: {
    M: 300,
    YES: 0,
    NO: 0,
  },
}

function BalanceTable() {
  /* Display all users current M, YES, and NO in a table */
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="px-4 py-2">User</th>
          <th className="px-4 py-2">M</th>
          <th className="px-4 py-2">YES</th>
          <th className="px-4 py-2">NO</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(users).map((user) => (
          <tr key={user}>
            <td className="px-4 py-2">{user}</td>
            <td className="px-4 py-2">{users[user].M}</td>
            <td className="px-4 py-2">{users[user].YES}</td>
            <td className="px-4 py-2">{users[user].NO}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* Show the values in pool */
function PoolTable(props: { pool: Swap3Pool }) {
  const { pool } = props
  return (
    <Row className="gap-4">
      <div>
        <label>Liquidity: </label>
        {pool.liquidity}
      </div>
      <div>
        <label>Sqrt Ratio: </label>
        {pool.sqrtRatio}
      </div>
      <div>
        <label>Tick: </label>
        {pool.tick}
      </div>
      <div>
        <label>Pool YES: </label>
        {pool.liquidity * pool.sqrtRatio}
      </div>
      <div>
        <label>Pool NO: </label>
        {pool.liquidity / pool.sqrtRatio}
      </div>
      <div>
        <label>Prob: </label>
        {formatPercent(getSwap3Probability(pool))}
      </div>
    </Row>
  )
}

export default function Swap() {
  const [pool, setPool] = useState({
    liquidity: 100,
    sqrtRatio: 2,
    tick: fromProb(0.3),
    ticks: [],
  })

  const [minTick, setMinTick] = useState(0)
  const [maxTick, setMaxTick] = useState(0)

  const { requiredN, requiredY } = calculateLPCost(
    pool.tick,
    minTick,
    maxTick,
    100 // deltaL
  )

  return (
    <Col className="mx-auto max-w-2xl gap-20 p-4">
      <BalanceTable />
      <PoolTable pool={pool} />
      <input
        className="input"
        placeholder="Current Prob"
        type="number"
        onChange={(e) =>
          setPool((p) => ({
            ...p,
            tick: inputPercentToTick(e),
          }))
        }
      />

      <Col>
        Alice: Add liquidity
        <input className="input" placeholder="Amount" type="number" />
        <input
          className="input"
          placeholder="Min"
          type="number"
          onChange={(e) => setMinTick(inputPercentToTick(e))}
        />
        Min Tick: {minTick}
        <input
          className="input"
          placeholder="Max"
          type="number"
          onChange={(e) => setMaxTick(inputPercentToTick(e))}
        />
        Max Tick: {maxTick}
        <Row className="gap-2 py-2">
          <div>Y required: {requiredY}</div>
          <div>N required: {requiredN}</div>{' '}
        </Row>
        <button className="btn">Create pool</button>
      </Col>

      <Col>
        Bob: Buy Tokens
        {/* <input className="input" placeholder="User" type="text" /> */}
        <input className="input" placeholder="Amount" type="number" />
        <Row className="gap-2">
          <button className="btn">Buy YES</button>
          <button className="btn">Buy NO</button>
        </Row>
      </Col>
    </Col>
  )
}

function inputPercentToTick(event: React.ChangeEvent<HTMLInputElement>) {
  return fromProb(parseFloat(event.target.value) / 100)
}
