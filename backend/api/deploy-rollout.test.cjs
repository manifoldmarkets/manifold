/* eslint-env es2022 */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { rollout } = require('./deploy-rollout.cjs')

const options = {
  project: 'test-project',
  zone: 'us-east4-a',
  group: 'api-group-east',
  template: 'api-new',
}
const root = 'https://www.googleapis.com/compute/v1/projects/test-project'
const groupUrl = `${root}/zones/us-east4-a/instanceGroups/api-group-east`
const vm = (name, template) => ({
  instance: `${root}/zones/us-east4-a/instances/${name}`,
  instanceStatus: 'RUNNING',
  currentAction: 'NONE',
  version: { instanceTemplate: `${root}/global/instanceTemplates/${template}` },
})

function fixture({
  health = () => 'HEALTHY',
  checkPath = '/healthz/ready',
  resume = false,
  noServices = false,
  commandError,
} = {}) {
  let time = 0
  const calls = []
  const info = {
    selfLink: `${root}/zones/us-east4-a/instanceGroupManagers/api-group-east`,
    instanceGroup: groupUrl,
    targetSize: resume ? 2 : 1,
    status: { isStable: true },
    updatePolicy: { type: resume ? 'OPPORTUNISTIC' : 'PROACTIVE' },
    instanceTemplate: `${root}/global/instanceTemplates/${
      resume ? 'api-new' : 'api-old'
    }`,
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
      const healthState = health(args[3], time)
      return [
        {
          backend: groupUrl,
          status: {
            healthStatus:
              healthState == null
                ? []
                : vms.map((v) => ({
                    instance: v.instance,
                    healthState: v.instance.endsWith('/old')
                      ? 'HEALTHY'
                      : healthState,
                  })),
          },
        },
      ]
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
      if (args.includes('--template=api-new'))
        info.instanceTemplate = `${root}/global/instanceTemplates/api-new`
    } else if (action === 'update-autoscaling') {
      info.autoscaler.autoscalingPolicy.mode = args
        .find((arg) => arg.startsWith('--mode='))
        .slice(7)
        .toUpperCase()
        .replaceAll('-', '_')
    } else if (action === 'resize') {
      assert.equal(info.updatePolicy.type, 'OPPORTUNISTIC')
      info.targetSize = 2
      vms.push(vm('new', 'api-new'))
    } else if (action === 'delete-instances') {
      assert(args.includes('--instances=old'), 'Only the old VM may be deleted')
      assert.equal(info.updatePolicy.type, 'OPPORTUNISTIC')
      info.targetSize = 1
      vms = vms.filter((v) => !v.instance.endsWith('/old'))
    } else throw new Error(`Unexpected command: ${args.join(' ')}`)
    return {}
  }
  return {
    calls,
    info,
    dependencies: {
      gcloud,
      now: () => time,
      pause: async (ms) => {
        time += ms
      },
      log: () => {},
      timeoutMs: 60_000,
    },
  }
}
const deletions = (f) =>
  f.calls.filter(({ args }) => args[3] === 'delete-instances')

test('retains the old VM until every read port and websocket backend is healthy', async () => {
  const f = fixture({
    health: (service, time) =>
      service.endsWith('-2') && time < 50_000 ? 'UNHEALTHY' : 'HEALTHY',
  })
  await rollout(options, f.dependencies)
  assert.equal(deletions(f).length, 1)
  assert.equal(deletions(f)[0].time, 50_000)
  assert.equal(f.info.targetSize, 1)
  assert.equal(f.info.updatePolicy.type, 'PROACTIVE')
  assert(
    f.calls
      .slice(f.calls.indexOf(deletions(f)[0]) + 1)
      .some(({ args }) => args[2] === 'get-health')
  )
})

test('does not delete or resume proactive updates when a new VM stays unhealthy', async () => {
  const f = fixture({ health: () => 'UNHEALTHY' })
  await assert.rejects(rollout(options, f.dependencies), /Timed out/)
  assert.equal(deletions(f).length, 0)
  assert.equal(f.info.targetSize, 2)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
})

test('missing replacement health data is not treated as ready', async () => {
  const f = fixture({ health: () => undefined })
  await assert.rejects(rollout(options, f.dependencies), /Timed out/)
  assert.equal(deletions(f).length, 0)
})

test('rejects a liveness-only backend before modifying infrastructure', async () => {
  const f = fixture({ checkPath: '/healthz/live' })
  await assert.rejects(
    rollout(options, f.dependencies),
    /must check \/healthz\/ready/
  )
  assert(
    !f.calls.some(({ args }) =>
      ['update', 'resize', 'delete-instances'].includes(args[3])
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

test('pauses and restores the production autoscaler around replacement', async () => {
  const f = fixture()
  f.info.autoscaler = {
    autoscalingPolicy: { mode: 'ON', minNumReplicas: 1, maxNumReplicas: 1 },
  }
  await rollout(options, f.dependencies)
  const pauseIndex = f.calls.findIndex(
    ({ args }) =>
      args[3] === 'update-autoscaling' && args.includes('--mode=off')
  )
  const resizeIndex = f.calls.findIndex(({ args }) => args[3] === 'resize')
  assert(pauseIndex >= 0 && pauseIndex < resizeIndex)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
  assert(f.calls[f.calls.length - 1].args.includes('--mode=on'))
})

test('leaves autoscaling off when the replacement cannot become ready', async () => {
  const f = fixture({ health: () => 'UNHEALTHY' })
  f.info.autoscaler = {
    autoscalingPolicy: { mode: 'ON', minNumReplicas: 1, maxNumReplicas: 1 },
  }
  await assert.rejects(rollout(options, f.dependencies), /Timed out/)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'OFF')
  assert.equal(f.info.targetSize, 2)
  assert.equal(deletions(f).length, 0)
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
  assert.equal(deletions(f).length, 0)
  await rollout({ ...options, restoreAutoscalingMode: 'ON' }, f.dependencies)
  assert.equal(f.info.autoscaler.autoscalingPolicy.mode, 'ON')
})

test('keeps both VMs and stops on a health-query command failure', async () => {
  const f = fixture({ commandError: (args) => args[2] === 'get-health' })
  await assert.rejects(rollout(options, f.dependencies), /gcloud failed/)
  assert.equal(deletions(f).length, 0)
  assert.equal(f.info.targetSize, 2)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
})

test('resumes the same template without creating another VM', async () => {
  const f = fixture({ resume: true })
  await rollout(options, f.dependencies)
  assert(!f.calls.some(({ args }) => args[3] === 'resize'))
  assert.equal(deletions(f).length, 1)
  assert.equal(f.info.targetSize, 1)
})

test('rejects an unrelated two-VM deployment without deleting anything', async () => {
  const f = fixture({ resume: true })
  await assert.rejects(
    rollout({ ...options, template: 'api-other' }, f.dependencies),
    /Expected a stable single-VM MIG/
  )
  assert.equal(deletions(f).length, 0)
})

test('can verify a rollout again after the old VM was already removed', async () => {
  const f = fixture()
  await rollout(options, f.dependencies)
  await rollout(options, f.dependencies)
  assert.equal(deletions(f).length, 1)
  assert.equal(f.calls.filter(({ args }) => args[3] === 'resize').length, 1)
})

test('fails deployment if a backend becomes unhealthy after old-VM removal', async () => {
  const f = fixture({
    health: () => (deletions(f).length > 0 ? 'UNHEALTHY' : 'HEALTHY'),
  })
  await assert.rejects(rollout(options, f.dependencies), /Timed out/)
  assert.equal(deletions(f).length, 1)
  assert.equal(f.info.updatePolicy.type, 'OPPORTUNISTIC')
})

test('does not delete a VM when the desired template changes during health checks', async () => {
  const f = fixture({
    health: () => {
      f.info.instanceTemplate = `${root}/global/instanceTemplates/api-other`
      return 'HEALTHY'
    },
  })
  await assert.rejects(rollout(options, f.dependencies), /MIG template changed/)
  assert.equal(deletions(f).length, 0)
})
