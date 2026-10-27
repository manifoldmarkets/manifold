/* eslint-env es2022 */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  rollout,
  HANDOVER_KEY,
  PENDING_HANDOVER_KEY,
} = require('./deploy-rollout.cjs')

const options = {
  project: 'test-project',
  zone: 'us-east4-a',
  group: 'api-group-east',
  template: 'api-new',
}
const root = 'https://www.googleapis.com/compute/v1/projects/test-project'
const groupUrl = `${root}/zones/us-east4-a/instanceGroups/api-group-east`
const templateUrl = (name) => `${root}/global/instanceTemplates/${name}`
const vm = (name, template) => ({
  instance: `${root}/zones/us-east4-a/instances/${name}`,
  instanceStatus: 'RUNNING',
  currentAction: 'NONE',
  version: { instanceTemplate: templateUrl(template) },
})
const nameOf = (resource) => resource.split('/').pop()
const flag = (args, name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const productionAutoscaler = () => ({
  autoscalingPolicy: { mode: 'ON', minNumReplicas: 1, maxNumReplicas: 1 },
})

// A fake gcloud for one zonal MIG behind five global backend services (write,
// websocket, three read ports). `health` decides the replacement's state per
// backend and `oldHealth` the old VM's. A deleted VM stays visible in Compute
// for `computeLag` lookups, like a VM that is still shutting down.
function fixture({
  health = () => 'HEALTHY',
  oldHealth = () => 'HEALTHY',
  checkPath = '/healthz/ready',
  resume = false,
  noServices = false,
  commandError,
  computeLag = 0,
} = {}) {
  let time = 0
  const calls = []
  const metadata = {}
  const shuttingDown = new Map()
  const info = {
    selfLink: `${root}/zones/us-east4-a/instanceGroupManagers/api-group-east`,
    instanceGroup: groupUrl,
    targetSize: resume ? 2 : 1,
    status: { isStable: true },
    updatePolicy: { type: resume ? 'OPPORTUNISTIC' : 'PROACTIVE' },
    instanceTemplate: templateUrl(resume ? 'api-new' : 'api-old'),
  }
  let vms = [vm('old', 'api-old'), ...(resume ? [vm('new', 'api-new')] : [])]
  const services = noServices
    ? []
    : [
        'api-lb-service',
        'api-websocket-lb-backend',
        'api-lb-read-service-0',
        'api-lb-read-service-1',
        'api-lb-read-service-2',
      ].map((name) => ({
        name,
        backends: [{ group: groupUrl }],
        healthChecks: [`${root}/global/healthChecks/${name}-ready`],
      }))
  const gcloud = (args) => {
    calls.push({ args, time })
    if (commandError?.(args)) throw new Error('gcloud failed')
    if (args[1] === 'health-checks')
      return { httpHealthCheck: { requestPath: checkPath } }
    if (args[1] === 'backend-services') {
      if (args[2] === 'list') return services
      assert.equal(args[2], 'get-health')
      const healthStatus = vms.flatMap((v) => {
        const name = nameOf(v.instance)
        const state =
          name === 'old' ? oldHealth(args[3], time) : health(args[3], time)
        return state == null
          ? []
          : [{ instance: v.instance, healthState: state }]
      })
      return [{ backend: groupUrl, status: { healthStatus } }]
    }
    if (args[1] === 'instances') {
      const [, , action, name] = args
      if (action === 'describe') {
        const items = Object.entries(metadata[name] ?? {}).map(
          ([key, value]) => ({ key, value })
        )
        return { name, metadata: { items } }
      }
      if (action === 'add-metadata') {
        const [key, value] = flag(args, 'metadata').split('=')
        metadata[name] = { ...metadata[name], [key]: value }
        return undefined
      }
      assert.equal(action, 'list')
      const target = flag(args, 'filter').replace(/^name=/, '')
      const remaining = shuttingDown.get(target) ?? 0
      if (remaining > 0) shuttingDown.set(target, remaining - 1)
      const exists =
        remaining > 0 || vms.some((v) => nameOf(v.instance) === target)
      return exists ? [{ name: target }] : []
    }
    const action = args[3]
    if (action === 'describe') return structuredClone(info)
    if (action === 'list-instances') return structuredClone(vms)
    if (action === 'update') {
      info.updatePolicy.type = args.includes(
        '--update-policy-type=opportunistic'
      )
        ? 'OPPORTUNISTIC'
        : 'PROACTIVE'
      const target = flag(args, 'template')
      if (target) info.instanceTemplate = templateUrl(target)
    } else if (action === 'update-autoscaling') {
      info.autoscaler.autoscalingPolicy.mode = flag(args, 'mode')
        .toUpperCase()
        .replaceAll('-', '_')
    } else if (action === 'resize') {
      assert.equal(info.updatePolicy.type, 'OPPORTUNISTIC')
      info.targetSize = 2
      vms.push(vm('new', nameOf(info.instanceTemplate)))
    } else if (action === 'delete-instances') {
      const name = flag(args, 'instances')
      assert(
        vms.some((v) => nameOf(v.instance) === name),
        `Deleting unknown VM ${name}`
      )
      assert.equal(info.updatePolicy.type, 'OPPORTUNISTIC')
      info.targetSize = 1
      vms = vms.filter((v) => nameOf(v.instance) !== name)
      shuttingDown.set(name, computeLag)
    } else throw new Error(`Unexpected command: ${args.join(' ')}`)
    return {}
  }
  return {
    calls,
    info,
    metadata,
    vms: () => vms.map((v) => nameOf(v.instance)),
    dependencies: {
      gcloud,
      now: () => time,
      pause: async (ms) => {
        time += ms
      },
      log: () => {},
      timeoutMs: 60_000,
      convergenceMs: 60_000,
    },
  }
}
const indexOf = (f, predicate) =>
  f.calls.findIndex(({ args }) => predicate(args))
const deletions = (f) =>
  f.calls
    .filter(({ args }) => args[3] === 'delete-instances')
    .map(({ args }) => flag(args, 'instances'))
const handoverSignals = (f) =>
  f.calls.filter(
    ({ args }) =>
      args[2] === 'add-metadata' &&
      flag(args, 'metadata').startsWith(`${HANDOVER_KEY}=`)
  )
const groupTemplate = (f) => nameOf(f.info.instanceTemplate)

test('retains the old VM until every read port and websocket backend is healthy', async () => {
  const f = fixture({
    health: (service, time) =>
      service.endsWith('-2') && time < 50_000 ? 'UNHEALTHY' : 'HEALTHY',
  })
  await rollout(options, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
  const deletion = f.calls[indexOf(f, (args) => args[3] === 'delete-instances')]
  assert.equal(deletion.time, 50_000)
  assert.equal(f.info.targetSize, 1)
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  assert(
    f.calls
      .slice(f.calls.indexOf(deletion) + 1)
      .some(({ args }) => args[2] === 'get-health')
  )
})

test('signals the survivor only after the retired VM is gone from Compute', async () => {
  const f = fixture({ computeLag: 2 })
  await rollout(options, f.dependencies)
  const pending = indexOf(
    f,
    (args) =>
      args[2] === 'add-metadata' &&
      flag(args, 'metadata') === `${PENDING_HANDOVER_KEY}=old`
  )
  const deletion = indexOf(f, (args) => args[3] === 'delete-instances')
  const [signal] = handoverSignals(f)
  const restored = indexOf(f, (args) =>
    args.includes('--update-policy-type=proactive')
  )
  assert(pending >= 0 && pending < deletion)
  assert.equal(handoverSignals(f).length, 1)
  assert.equal(signal.args[3], 'new')
  assert.equal(flag(signal.args, 'metadata'), `${HANDOVER_KEY}=old`)
  // The old VM lingered for two lookups, five seconds apart.
  assert.equal(signal.time - f.calls[deletion].time, 10_000)
  assert(f.calls.indexOf(signal) < restored)
  assert.deepEqual(f.metadata.new, {
    [PENDING_HANDOVER_KEY]: 'old',
    [HANDOVER_KEY]: 'old',
  })
})

test('deploys a group without an autoscaler, as in dev', async () => {
  const f = fixture()
  await rollout(options, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(handoverSignals(f).length, 1)
  assert(!f.calls.some(({ args }) => args[3] === 'update-autoscaling'))
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('replaces a production writer that predates the handover signal', async () => {
  // The first transition: the running VM came from a template without the
  // handover watcher. The rollout needs nothing from it, and only ever writes
  // handover metadata to the replacement.
  const f = fixture({ computeLag: 1 })
  f.info.autoscaler = productionAutoscaler()
  await rollout(options, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(f.metadata.old, undefined)
  assert.equal(f.metadata.new[HANDOVER_KEY], 'old')
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('rolls back a replacement that never becomes ready', async () => {
  const f = fixture({ health: () => 'UNHEALTHY' })
  await assert.rejects(
    rollout(options, f.dependencies),
    /Timed out.*rolled back to api-old/
  )
  assert.deepEqual(deletions(f), ['new'])
  assert.deepEqual(f.vms(), ['old'])
  assert.equal(groupTemplate(f), 'api-old')
  assert.equal(f.info.targetSize, 1)
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  // The old writer is told the replacement is gone, after its deletion.
  assert.equal(f.metadata.old[HANDOVER_KEY], 'new')
  const [signal] = handoverSignals(f)
  assert(
    f.calls.indexOf(signal) >
      indexOf(f, (args) => args[3] === 'delete-instances')
  )
})

test('rolls back a replacement that stays ready in only some backends', async () => {
  const f = fixture({
    health: (service) => (service.endsWith('-2') ? 'UNHEALTHY' : 'HEALTHY'),
  })
  await assert.rejects(
    rollout(options, { ...f.dependencies, convergenceMs: 20_000 }),
    /new was ready in only 4 of 5 backends.*rolled back to api-old/
  )
  // Bounded by the convergence deadline, well before the overall timeout.
  const deletion = f.calls[indexOf(f, (args) => args[3] === 'delete-instances')]
  assert.equal(deletion.time, 20_000)
  assert.deepEqual(deletions(f), ['new'])
  assert.equal(f.metadata.old[HANDOVER_KEY], 'new')
  assert.equal(groupTemplate(f), 'api-old')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('missing replacement health data is not treated as ready', async () => {
  const f = fixture({ health: () => undefined })
  await assert.rejects(rollout(options, f.dependencies), /rolled back/)
  assert.deepEqual(deletions(f), ['new'])
})

test('does not roll back onto an old VM that is not ready', async () => {
  const f = fixture({
    health: () => 'UNHEALTHY',
    oldHealth: (_service, time) => (time < 30_000 ? 'HEALTHY' : 'UNHEALTHY'),
  })
  await assert.rejects(
    rollout(options, f.dependencies),
    /rollback to api-old did not finish/
  )
  assert.deepEqual(deletions(f), [])
  assert.deepEqual(f.vms(), ['old', 'new'])
  assert.equal(f.info.targetSize, 2)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
})

test('never deletes a VM while health queries keep failing', async () => {
  const f = fixture({ commandError: (args) => args[2] === 'get-health' })
  await assert.rejects(
    rollout(options, f.dependencies),
    /last error: gcloud failed.*did not finish/
  )
  assert.deepEqual(deletions(f), [])
  assert.equal(f.info.targetSize, 2)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
})

test('retries transient gcloud failures while waiting', async () => {
  let failures = 3
  const f = fixture({
    commandError: (args) => args[2] === 'get-health' && failures-- > 0,
  })
  await rollout(options, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
})

test('rejects a liveness-only backend before modifying infrastructure', async () => {
  const f = fixture({ checkPath: '/healthz/live' })
  await assert.rejects(
    rollout(options, f.dependencies),
    /must check \/healthz\/ready/
  )
  assert(
    !f.calls.some(
      ({ args }) =>
        ['update', 'resize', 'delete-instances'].includes(args[3]) ||
        args[2] === 'add-metadata'
    )
  )
})

test('rejects an empty backend list before modifying infrastructure', async () => {
  const f = fixture({ noServices: true })
  await assert.rejects(
    rollout(options, f.dependencies),
    /No load-balancer backends/
  )
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('rejects an autoscaler that is not pinned to one VM', async () => {
  const f = fixture()
  f.info.autoscaler = { autoscalingPolicy: { mode: 'ON' } }
  await assert.rejects(rollout(options, f.dependencies), /pinned to one VM/)
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('pauses the production autoscaler only while the group is opportunistic', async () => {
  const f = fixture()
  f.info.autoscaler = productionAutoscaler()
  await rollout(options, f.dependencies)
  const order = [
    ['update', '--update-policy-type=opportunistic'],
    ['update-autoscaling', '--mode=off'],
    ['resize', '--size=2'],
    ['update-autoscaling', '--mode=on'],
    ['update', '--update-policy-type=proactive'],
  ].map(([action, flag]) =>
    indexOf(f, (args) => args[3] === action && args.includes(flag))
  )
  assert(
    order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]))
  )
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('requires the original mode after a run stops between the policy switch and the pause', async () => {
  let failPause = true
  const f = fixture({
    commandError: (args) =>
      failPause &&
      args[3] === 'update-autoscaling' &&
      args.includes('--mode=off'),
  })
  f.info.autoscaler = productionAutoscaler()
  await assert.rejects(rollout(options, f.dependencies), /gcloud failed/)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  failPause = false
  await assert.rejects(
    rollout(options, f.dependencies),
    /original autoscaling mode/
  )
  await rollout({ ...options, restoreAutoscalingMode: 'ON' }, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('requires the original mode after a run stops with the autoscaler paused', async () => {
  let failResize = true
  const f = fixture({
    commandError: (args) => failResize && args[3] === 'resize',
  })
  f.info.autoscaler = productionAutoscaler()
  await assert.rejects(rollout(options, f.dependencies), /gcloud failed/)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'OFF')
  failResize = false
  // The live OFF is the stopped run's pause, not the mode to restore.
  await assert.rejects(
    rollout(options, f.dependencies),
    /original autoscaling mode/
  )
  await rollout({ ...options, restoreAutoscalingMode: 'ON' }, f.dependencies)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  assert.deepEqual(deletions(f), ['old'])
})

test('requires the original mode after a run stops between restoring the autoscaler and proactive updates', async () => {
  let failProactive = true
  const f = fixture({
    commandError: (args) =>
      failProactive && args.includes('--update-policy-type=proactive'),
  })
  f.info.autoscaler = productionAutoscaler()
  await assert.rejects(rollout(options, f.dependencies), /gcloud failed/)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  failProactive = false
  await assert.rejects(
    rollout(options, f.dependencies),
    /original autoscaling mode/
  )
  await rollout({ ...options, restoreAutoscalingMode: 'ON' }, f.dependencies)
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  assert.equal(handoverSignals(f).length, 1)
})

test('restores the production autoscaler after a rollback', async () => {
  const f = fixture({ health: () => 'UNHEALTHY' })
  f.info.autoscaler = productionAutoscaler()
  await assert.rejects(rollout(options, f.dependencies), /rolled back/)
  assert.deepEqual(deletions(f), ['new'])
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
})

test('restores the original autoscaling mode when resuming', async () => {
  const f = fixture({ resume: true })
  f.info.autoscaler = {
    autoscalingPolicy: { mode: 'OFF', minNumReplicas: 1, maxNumReplicas: 1 },
  }
  await assert.rejects(
    rollout(options, f.dependencies),
    /original autoscaling mode/
  )
  assert.deepEqual(deletions(f), [])
  await rollout({ ...options, restoreAutoscalingMode: 'ON' }, f.dependencies)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
})

test('resumes the same template without creating another VM', async () => {
  const f = fixture({ resume: true })
  await rollout(options, f.dependencies)
  assert(!f.calls.some(({ args }) => args[3] === 'resize'))
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(f.info.targetSize, 1)
  assert.equal(f.metadata.new[HANDOVER_KEY], 'old')
})

test('finishes an interrupted handover exactly once', async () => {
  let failSignal = true
  const f = fixture({
    commandError: (args) =>
      failSignal &&
      args[2] === 'add-metadata' &&
      flag(args, 'metadata').startsWith(`${HANDOVER_KEY}=`),
  })
  await assert.rejects(rollout(options, f.dependencies), /gcloud failed/)
  assert.deepEqual(deletions(f), ['old'])
  assert.deepEqual(f.metadata.new, { [PENDING_HANDOVER_KEY]: 'old' })
  failSignal = false
  await rollout(options, f.dependencies)
  assert.equal(f.metadata.new[HANDOVER_KEY], 'old')
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  const signals = handoverSignals(f).length
  // A later verification run must not ask clients to reconnect again.
  await rollout(options, f.dependencies)
  assert.equal(handoverSignals(f).length, signals)
})

test('rejects an unrelated two-VM deployment without deleting anything', async () => {
  const f = fixture({ resume: true })
  await assert.rejects(
    rollout({ ...options, template: 'api-other' }, f.dependencies),
    /Expected a stable single-VM MIG/
  )
  assert.deepEqual(deletions(f), [])
})

test('can verify a rollout again after the old VM was already removed', async () => {
  const f = fixture()
  await rollout(options, f.dependencies)
  await rollout(options, f.dependencies)
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(f.calls.filter(({ args }) => args[3] === 'resize').length, 1)
  assert.equal(handoverSignals(f).length, 1)
})

test('fails deployment if a backend becomes unhealthy after old-VM removal', async () => {
  const f = fixture({
    health: () => (deletions(f).length > 0 ? 'UNHEALTHY' : 'HEALTHY'),
  })
  await assert.rejects(rollout(options, f.dependencies), /Timed out/)
  assert.deepEqual(deletions(f), ['old'])
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
  // The old VM is gone, so the survivor was still told about the handover.
  assert.equal(f.metadata.new[HANDOVER_KEY], 'old')
})

test('does not delete a VM when the desired template changes during health checks', async () => {
  const f = fixture({
    health: () => {
      f.info.instanceTemplate = templateUrl('api-other')
      return 'HEALTHY'
    },
  })
  await assert.rejects(rollout(options, f.dependencies), /MIG template changed/)
  assert.deepEqual(deletions(f), [])
})
