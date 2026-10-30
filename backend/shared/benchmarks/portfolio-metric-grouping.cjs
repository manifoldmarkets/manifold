/* eslint-env node, es2022 */
// Synthetic, offline benchmark of the association step only. No application
// bootstrap, database, secrets, or financial calculation is invoked here.
// Run from the repository root:
//   node backend/shared/benchmarks/portfolio-metric-grouping.cjs
// The loader regression tests separately exercise the real financial calculator.
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const { groupBy } = require('lodash')

const CONTRACT_COUNT = 24_000
const METRIC_COUNT = 150_000
const WORKER_TIMEOUT_MS = 120_000

const associate = {
  legacy: (contracts, metrics) =>
    contracts.map((c) => ({
      contract: c,
      metrics: metrics.filter((m) => m.contractId === c.id),
    })),
  grouped: (contracts, metrics) => {
    const metricsByContractId = groupBy(metrics, (m) => m.contractId)
    return contracts.map((c) => ({
      contract: c,
      metrics: Object.prototype.hasOwnProperty.call(metricsByContractId, c.id)
        ? metricsByContractId[c.id]
        : [],
    }))
  },
}

const fixture = (contractCount, metricCount) => {
  const contractIds = Array.from({ length: contractCount }, (_, i) =>
    `contract-${i}`.padEnd(20, 'x')
  )
  const contracts = contractIds.map((id) => ({ id }))
  const metrics = Array.from({ length: metricCount }, (_, i) => ({
    id: i,
    // Interleaved rows, with 20% concentrated among 100 hotter contracts.
    contractId:
      contractIds[
        i % 5 === 0
          ? Math.floor(i / 5) % Math.min(100, contractCount)
          : ((i - Math.floor(i / 5) - 1) * 104729) % contractCount
      ],
    userId: `user-${i % 400}`,
    answerId: i % 3 === 0 ? `answer-${i % 7}` : null,
    invested: 12,
    loan: 3,
    marginLoan: 4,
    totalAmountInvested: 17,
    totalAmountSold: 5,
    totalShares: { YES: 20 + (i % 50), NO: 3 },
    totalSpent: { YES: 10, NO: 2 },
    payout: 15,
    profit: 3,
    profitPercent: 25,
    hasShares: true,
    hasYesShares: true,
    hasNoShares: true,
    maxSharesOutcome: 'YES',
    lastBetTime: 1_700_000_000_000,
    lastProb: 0.5,
    isRanked: i % 7 !== 0,
    from: {
      day: {
        profit: 1,
        profitPercent: 10,
        invested: 10,
        prevValue: 10,
        value: 11,
      },
    },
  }))
  return { contracts, metrics }
}

const worker = (variant) => {
  assert.ok(Object.hasOwn(associate, variant))
  assert.ok(global.gc, 'Run the worker with --expose-gc')
  const warmup = fixture(250, 3_000)
  for (let i = 0; i < 3; i++)
    associate[variant](warmup.contracts, warmup.metrics)

  const { contracts, metrics } = fixture(CONTRACT_COUNT, METRIC_COUNT)
  global.gc()
  const before = process.memoryUsage()
  const cpuStart = process.cpuUsage()
  const start = performance.now()
  const output = associate[variant](contracts, metrics)
  const wallMs = performance.now() - start
  const cpu = process.cpuUsage(cpuStart)
  const after = process.memoryUsage()
  global.gc()
  const retained = process.memoryUsage()
  const maxRssKiB = process.resourceUsage().maxRSS

  // Validate references, bucket membership, order, omissions and duplicates
  // outside the timing window, then compare exact ordered IDs across workers.
  const seen = new Uint8Array(METRIC_COUNT)
  assert.ok(output.every(({ metrics: bucket }) => bucket.length > 0))
  const orderedIds = output.map(({ contract, metrics: bucket }, index) => {
    assert.equal(contract, contracts[index])
    let previous = -1
    return bucket.map((metric) => {
      assert.equal(metric, metrics[metric.id])
      assert.equal(metric.contractId, contract.id)
      assert.ok(metric.id > previous)
      assert.equal(seen[metric.id], 0)
      previous = metric.id
      seen[metric.id] = 1
      return metric.id
    })
  })
  assert.ok(seen.every((count) => count === 1))
  return {
    variant,
    wallMs,
    cpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
    memoryBytes: {
      before,
      after,
      retained,
      heapDelta: after.heapUsed - before.heapUsed,
      retainedHeapDelta: retained.heapUsed - before.heapUsed,
    },
    // Whole-worker peak RSS includes fixture creation and warmup.
    maxRssKiB,
    orderedIds,
  }
}

if (process.argv[2] === '--worker') {
  process.stdout.write(JSON.stringify(worker(process.argv[3])))
} else {
  const results = {}
  for (const variant of ['grouped', 'legacy']) {
    process.stderr.write(
      `Running ${variant} worker (limit ${WORKER_TIMEOUT_MS / 1000}s)...\n`
    )
    const child = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=768',
        __filename,
        '--worker',
        variant,
      ],
      {
        encoding: 'utf8',
        timeout: WORKER_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      }
    )
    if (child.error || child.status !== 0) {
      const completed = { ...results.grouped }
      delete completed.orderedIds
      process.stdout.write(
        JSON.stringify(
          {
            status: 'incomplete',
            failedVariant: variant,
            error: child.error?.message ?? child.stderr,
            timeoutMs: WORKER_TIMEOUT_MS,
            completed,
          },
          null,
          2
        ) + '\n'
      )
      process.exitCode = 1
      break
    }
    results[variant] = JSON.parse(child.stdout)
  }
  if (results.grouped && results.legacy) {
    assert.deepStrictEqual(
      results.grouped.orderedIds,
      results.legacy.orderedIds
    )
    delete results.grouped.orderedIds
    delete results.legacy.orderedIds
    process.stdout.write(
      JSON.stringify(
        {
          status: 'pass',
          scope:
            'Synthetic association step only; not end-to-end scheduler or OOM evidence',
          node: process.version,
          platform: `${process.platform}/${process.arch}`,
          contractCount: CONTRACT_COUNT,
          metricCount: METRIC_COUNT,
          timeoutMs: WORKER_TIMEOUT_MS,
          exactOrderedResultsEqual: true,
          speedup: results.legacy.wallMs / results.grouped.wallMs,
          results,
        },
        null,
        2
      ) + '\n'
    )
  }
}
