/* eslint-env es2022 */
// Usage: node deploy-rollout.cjs PROJECT ZONE GROUP TEMPLATE [RESTORE_AUTOSCALING_MODE]
// A single-VM API deployment: add a replacement, wait for LB readiness on all
// serving ports, remove the old VM, then tell the surviving writer that the
// handover is complete. See deploy-rollout.md for recovery.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { setTimeout: sleep } = require('node:timers/promises')

// Instance metadata watched by the API writer (shared/websockets/handover.ts).
// While two writers serve, each broadcasts only to its own sockets. Once the
// retired VM is gone, a new value here makes the survivor close every socket
// it accepted earlier, so those clients reconnect and backfill. The pending
// key is written before the deletion, so an interrupted run can finish it.
const HANDOVER_KEY = 'api-websocket-handover'
const PENDING_HANDOVER_KEY = 'api-websocket-handover-pending'

const nameOf = (resource) => resource.split('/').pop()
const templateOf = (instance) =>
  nameOf(instance.version?.instanceTemplate ?? '')

// The replacement did not become ready everywhere. The old VM kept serving, so
// this is the one failure the helper may undo by itself.
class NotReadyError extends Error {}

function runGcloud(args) {
  const command = [...args, '--quiet', '--format=json']
  const options = {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  }
  // Windows installs gcloud as a .cmd file. Only pass simple, generated tokens
  // to cmd.exe; never interpolate unvalidated shell syntax or resource names.
  let output
  if (process.platform === 'win32') {
    for (const arg of command) assert.match(arg, /^[a-zA-Z0-9_./:=,-]+$/)
    output = execFileSync(
      'cmd.exe',
      ['/d', '/s', '/c', ['gcloud.cmd', ...command].join(' ')],
      options
    )
  } else {
    output = execFileSync('gcloud', command, options)
  }
  return output.trim() ? JSON.parse(output) : undefined
}

async function rollout(
  { project, zone, group, template, restoreAutoscalingMode },
  dependencies = {}
) {
  const {
    gcloud = runGcloud,
    pause = sleep,
    now = Date.now,
    log = console.log,
    timeoutMs = 15 * 60_000,
    // How long a replacement may serve some backends but not others.
    convergenceMs = 3 * 60_000,
    rollbackOnFailure = true,
  } = dependencies
  for (const name of [project, zone, group, template]) {
    assert.match(name, /^[a-z][a-z0-9-]*$/)
  }
  const managed = (action, ...args) =>
    gcloud([
      'compute',
      'instance-groups',
      'managed',
      action,
      group,
      `--project=${project}`,
      `--zone=${zone}`,
      ...args,
    ])
  const globalResource = (resource, action, ...args) =>
    gcloud(['compute', resource, action, ...args, `--project=${project}`])
  const instanceResource = (action, name, ...args) =>
    globalResource('instances', action, name, `--zone=${zone}`, ...args)
  const describe = () => managed('describe')
  const instances = () => managed('list-instances')
  const desiredTemplate = (info) =>
    nameOf(info.instanceTemplate ?? info.versions?.[0]?.instanceTemplate ?? '')
  const info = describe()
  const startingInstances = instances()
  assert(info.instanceGroup, 'The MIG must expose its instance group URL')
  const autoscaling = info.autoscaler?.autoscalingPolicy
  const autoscalingMode = restoreAutoscalingMode ?? autoscaling?.mode
  if (autoscaling) {
    assert(
      ['ON', 'OFF', 'ONLY_SCALE_OUT'].includes(autoscalingMode),
      'Unknown autoscaling mode'
    )
    assert(
      autoscaling.minNumReplicas === 1 && autoscaling.maxNumReplicas === 1,
      'This rollout supports only an autoscaler pinned to one VM'
    )
    // A rollout pauses the autoscaler only while the group is opportunistic,
    // so an opportunistic group's live mode may be an interrupted run's pause
    // rather than the mode to restore.
    assert(
      info.updatePolicy?.type !== 'OPPORTUNISTIC' || restoreAutoscalingMode,
      'Resume with the original autoscaling mode from the recovery command printed by the deploy'
    )
  } else {
    assert(!restoreAutoscalingMode, 'There is no autoscaler to restore')
  }
  // Restore the autoscaler while the group is still opportunistic, so an
  // interruption between these steps also requires the original mode.
  const restorePolicies = () => {
    if (autoscaling) {
      managed(
        'update-autoscaling',
        `--mode=${autoscalingMode.toLowerCase().replaceAll('_', '-')}`
      )
    }
    managed('update', '--update-policy-type=proactive')
  }
  const recoveryCommand = (target) =>
    `node deploy-rollout.cjs ${project} ${zone} ${group} ${target}${
      autoscalingMode ? ` ${autoscalingMode}` : ''
    }`

  // Discover every backend using this group, including the write server,
  // websocket service and each read replica. A missing check is not success.
  const services = globalResource('backend-services', 'list').filter((s) =>
    s.backends?.some((b) => b.group === info.instanceGroup)
  )
  assert(services.length > 0, 'No load-balancer backends found for this MIG')
  for (const service of services) {
    assert(!service.region, 'Only global API backend services are supported')
    assert(
      service.healthChecks?.length > 0,
      `${service.name} has no health check`
    )
    for (const checkUrl of service.healthChecks) {
      assert(
        checkUrl.includes('/global/healthChecks/'),
        'Expected a global health check'
      )
      const check = globalResource(
        'health-checks',
        'describe',
        nameOf(checkUrl),
        '--global'
      )
      assert.equal(
        check.httpHealthCheck?.requestPath,
        '/healthz/ready',
        `${service.name} must check /healthz/ready; run update-health-checks.sh first`
      )
    }
  }
  // Whether the load balancer reports the instance HEALTHY, per backend.
  const backendReadiness = (instanceUrl) =>
    services.map((service) => {
      const statuses = globalResource(
        'backend-services',
        'get-health',
        service.name,
        '--global'
      )
        .filter((entry) => entry.backend === info.instanceGroup)
        .flatMap((entry) => entry.status?.healthStatus ?? [])
        .filter((entry) => entry.instance === instanceUrl)
      return (
        statuses.length > 0 &&
        statuses.every((entry) => entry.healthState === 'HEALTHY')
      )
    })
  const readyInEveryBackend = (instanceUrl) =>
    backendReadiness(instanceUrl).every(Boolean)
  const running = (vm) =>
    vm.instanceStatus === 'RUNNING' && vm.currentAction === 'NONE'
  // Poll until check() returns a result. An assertion failure means the group
  // changed underneath the rollout and stops it at once; any other error (a
  // failed gcloud call) only means "not yet" until the deadline.
  const waitFor = async (label, check) => {
    log(label)
    const deadline = now() + timeoutMs
    let lastError
    while (now() < deadline) {
      try {
        const result = check()
        if (result) return result
        lastError = undefined
      } catch (error) {
        if (
          error instanceof assert.AssertionError ||
          error instanceof NotReadyError
        ) {
          throw error
        }
        lastError = error
      }
      await pause(5_000)
    }
    throw new NotReadyError(
      `Timed out: ${label}${
        lastError ? ` (last error: ${lastError.message})` : ''
      }`
    )
  }

  const metadataOf = (name) =>
    Object.fromEntries(
      (instanceResource('describe', name).metadata?.items ?? []).map(
        ({ key, value }) => [key, value]
      )
    )
  const setMetadata = (name, key, value) =>
    instanceResource('add-metadata', name, `--metadata=${key}=${value}`)
  const signalHandover = (survivor, retired) => {
    setMetadata(survivor, HANDOVER_KEY, retired)
    log(
      `Asked ${survivor} to close WebSocket connections opened while ${retired} was serving`
    )
  }
  // A run interrupted after deleting the retired VM may not have signalled.
  const finishPendingHandover = (survivor) => {
    const metadata = metadataOf(survivor)
    const pending = metadata[PENDING_HANDOVER_KEY]
    if (pending && pending !== metadata[HANDOVER_KEY]) {
      signalHandover(survivor, pending)
    }
  }

  // Retrying the helper with the SAME template can finish an interrupted
  // rollout. Never guess which VM to delete after unrelated group changes.
  const resuming =
    info.targetSize === 2 &&
    info.updatePolicy?.type === 'OPPORTUNISTIC' &&
    desiredTemplate(info) === template
  assert(
    resuming || (info.targetSize === 1 && info.status?.isStable),
    'Expected a stable single-VM MIG, or an interrupted rollout of this template'
  )
  log(`Recovery command: ${recoveryCommand(template)}`)
  if (
    !resuming &&
    startingInstances.length === 1 &&
    templateOf(startingInstances[0]) === template
  ) {
    assert.equal(
      desiredTemplate(info),
      template,
      'MIG targets a different template'
    )
    finishPendingHandover(nameOf(startingInstances[0].instance))
    await waitFor('Checking the deployed VM is ready in every backend', () => {
      const vms = instances()
      return (
        vms.length === 1 &&
        running(vms[0]) &&
        readyInEveryBackend(vms[0].instance)
      )
    })
    restorePolicies()
    return
  }
  const oldInstances = startingInstances.filter(
    (vm) => templateOf(vm) !== template
  )
  assert.equal(oldInstances.length, 1, 'Expected exactly one old VM to retain')
  assert(
    resuming || (startingInstances.length === 1 && running(oldInstances[0])),
    'The old VM must be running before starting a rollout'
  )
  const oldInstance = oldInstances[0].instance

  if (!resuming) {
    // Set policy and template together: the updater must not replace the old
    // VM just because the new one starts answering /healthz/live. This comes
    // first so the autoscaler is never paused under a proactive policy.
    managed(
      'update',
      '--update-policy-type=opportunistic',
      `--template=${template}`
    )
    // The production autoscaler is ON with min=max=1. Pause it before adding
    // a VM so it cannot scale down the replacement while readiness is pending.
    if (autoscaling && autoscaling.mode !== 'OFF') {
      managed('update-autoscaling', '--mode=off')
    }
    managed('resize', '--size=2')
  }
  // Until the old VM is deleted, the group must stay exactly as this rollout
  // set it up; anything else means another deploy or an operator changed it.
  const assertRolloutUnchanged = (current) => {
    assert.equal(current.targetSize, 2, 'MIG size changed during rollout')
    assert.equal(
      current.updatePolicy?.type,
      'OPPORTUNISTIC',
      'MIG update policy changed during rollout'
    )
    assert.equal(
      desiredTemplate(current),
      template,
      'MIG template changed during rollout'
    )
    assert(
      !current.autoscaler ||
        current.autoscaler.autoscalingPolicy.mode === 'OFF',
      'Autoscaling was enabled during rollout'
    )
  }

  // The replacement never became ready everywhere, and the old VM served
  // throughout. Converge back to it with the same steps as a rollout: keep
  // it, delete the replacement by name, then have the old writer close the
  // sockets that may have missed the replacement's broadcasts.
  let replacementSeen
  const rollBack = async (cause) => {
    const previous = templateOf(oldInstances[0])
    log(`${cause.message}. Rolling back to ${previous}.`)
    log(`Rollback recovery command: ${recoveryCommand(previous)}`)
    try {
      if (replacementSeen) {
        setMetadata(nameOf(oldInstance), PENDING_HANDOVER_KEY, replacementSeen)
      }
      managed(
        'update',
        '--update-policy-type=opportunistic',
        `--template=${previous}`
      )
      await rollout(
        {
          project,
          zone,
          group,
          template: previous,
          restoreAutoscalingMode: autoscaling ? autoscalingMode : undefined,
        },
        { ...dependencies, rollbackOnFailure: false }
      )
    } catch (error) {
      throw new Error(
        `Rollout of ${template} failed (${cause.message}) and the rollback to ${previous} did not finish: ${error.message}`
      )
    }
    throw new Error(
      `Rollout of ${template} failed (${cause.message}); rolled back to ${previous}`
    )
  }

  let replacement
  try {
    let partiallyReadySince
    replacement = await waitFor(
      'Waiting for replacement readiness in every backend',
      () => {
        assertRolloutUnchanged(describe())
        const vms = instances()
        assert(
          vms.some((vm) => vm.instance === oldInstance),
          'Old VM changed during rollout'
        )
        const vm = vms.find(
          (vm) => vm.instance !== oldInstance && templateOf(vm) === template
        )
        if (vm) replacementSeen = nameOf(vm.instance)
        if (!(vms.length === 2 && vm && running(vm))) return undefined
        const ready = backendReadiness(vm.instance)
        if (ready.every(Boolean)) return vm
        // Serving some backends already splits traffic between two writers,
        // so the rest get a bounded time to follow before a rollback.
        if (ready.some(Boolean)) {
          partiallyReadySince ??= now()
          if (now() - partiallyReadySince >= convergenceMs) {
            throw new NotReadyError(
              `${nameOf(vm.instance)} was ready in only ${
                ready.filter(Boolean).length
              } of ${services.length} backends`
            )
          }
        }
        return undefined
      }
    )
  } catch (error) {
    if (!(error instanceof NotReadyError) || !rollbackOnFailure) throw error
    return rollBack(error)
  }

  // Health queries can take time. Recheck the group immediately before the
  // destructive step so another deploy cannot change which version survives.
  assertRolloutUnchanged(describe())
  const beforeRemovalVms = instances()
  assert(
    beforeRemovalVms.length === 2 &&
      beforeRemovalVms.some((vm) => vm.instance === oldInstance) &&
      beforeRemovalVms.some(
        (vm) =>
          vm.instance === replacement.instance &&
          templateOf(vm) === template &&
          running(vm)
      ),
    'MIG instances changed during rollout'
  )

  const survivor = nameOf(replacement.instance)
  const retired = nameOf(oldInstance)
  setMetadata(survivor, PENDING_HANDOVER_KEY, retired)
  log(`Replacement ${survivor} is ready; removing ${retired}`)
  // delete-instances reduces targetSize too. resize --size=1 could choose the
  // healthy replacement instead, so always name the old instance explicitly.
  managed('delete-instances', `--instances=${retired}`)
  // The retired writer can broadcast until its VM is gone, not merely out of
  // the group, so only then is it safe to ask the survivor to resync.
  await waitFor(`Waiting for ${retired} to shut down`, () => {
    const inGroup = instances().some((vm) => vm.instance === oldInstance)
    return (
      !inGroup &&
      globalResource(
        'instances',
        'list',
        `--zones=${zone}`,
        `--filter=name=${retired}`
      ).length === 0
    )
  })
  signalHandover(survivor, retired)
  await waitFor(
    'Verifying the final VM and every backend after removal',
    () => {
      const current = describe()
      const vms = instances()
      return (
        current.targetSize === 1 &&
        current.status?.isStable &&
        vms.length === 1 &&
        vms[0].instance === replacement.instance &&
        running(vms[0]) &&
        readyInEveryBackend(replacement.instance)
      )
    }
  )
  // Restoring automatic updates is safe only after no old-template VM remains.
  restorePolicies()
  log('API rollout complete; all load-balancer backends are healthy')
}

module.exports = { rollout, HANDOVER_KEY, PENDING_HANDOVER_KEY }
if (require.main === module) {
  const [project, zone, group, template, restoreAutoscalingMode, ...extra] =
    process.argv.slice(2)
  if (!template || extra.length) {
    console.error(
      'Usage: node deploy-rollout.cjs PROJECT ZONE GROUP TEMPLATE [RESTORE_AUTOSCALING_MODE]'
    )
    process.exitCode = 1
  } else {
    rollout({ project, zone, group, template, restoreAutoscalingMode }).catch(
      (error) => {
        console.error(error)
        console.error(
          'Rollout stopped. Inspect the MIG before any manual deletion; see deploy-rollout.md.'
        )
        process.exitCode = 1
      }
    )
  }
}
