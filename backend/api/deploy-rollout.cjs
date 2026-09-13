/* eslint-env es2022 */
// Usage: node deploy-rollout.cjs PROJECT ZONE GROUP TEMPLATE [RESTORE_AUTOSCALING_MODE]
// A single-VM API deployment: add a replacement, wait for LB readiness on all
// serving ports, then remove the old VM. See deploy-rollout.md for recovery.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { setTimeout: sleep } = require('node:timers/promises')

const nameOf = (resource) => resource.split('/').pop()
const templateOf = (instance) =>
  nameOf(instance.version?.instanceTemplate ?? '')

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
  {
    gcloud = runGcloud,
    pause = sleep,
    now = Date.now,
    log = console.log,
    timeoutMs = 15 * 60_000,
  } = {}
) {
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
  } else {
    assert(!restoreAutoscalingMode, 'There is no autoscaler to restore')
  }
  const restorePolicies = () => {
    managed('update', '--update-policy-type=proactive')
    if (autoscaling) {
      managed(
        'update-autoscaling',
        `--mode=${autoscalingMode.toLowerCase().replaceAll('_', '-')}`
      )
    }
  }

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
  const readyInEveryBackend = (instanceUrl) =>
    services.every((service) => {
      const health = globalResource(
        'backend-services',
        'get-health',
        service.name,
        '--global'
      )
      const statuses = health
        .filter((entry) => entry.backend === info.instanceGroup)
        .flatMap((entry) => entry.status?.healthStatus ?? [])
        .filter((entry) => entry.instance === instanceUrl)
      return (
        statuses.length > 0 &&
        statuses.every((entry) => entry.healthState === 'HEALTHY')
      )
    })
  const running = (vm) =>
    vm.instanceStatus === 'RUNNING' && vm.currentAction === 'NONE'
  const waitFor = async (label, check) => {
    log(label)
    const deadline = now() + timeoutMs
    while (now() < deadline) {
      const result = check()
      if (result) return result
      await pause(5_000)
    }
    throw new Error(
      `Timed out: ${label}. No automatic rollback or scale-down was attempted. See deploy-rollout.md.`
    )
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
  assert(
    !resuming || !autoscaling || restoreAutoscalingMode,
    'Resume with the original autoscaling mode from the recovery command printed by the deploy'
  )
  log(
    `Recovery command: node deploy-rollout.cjs ${project} ${zone} ${group} ${template}${
      autoscalingMode ? ` ${autoscalingMode}` : ''
    }`
  )
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
    // The production autoscaler is ON with min=max=1. Pause it before adding
    // a VM so it cannot scale down the replacement while readiness is pending.
    if (autoscaling && autoscaling.mode !== 'OFF') {
      managed('update-autoscaling', '--mode=off')
    }
    // Set policy and template together: the updater must not replace the old
    // VM just because the new one starts answering /healthz/live.
    managed(
      'update',
      '--update-policy-type=opportunistic',
      `--template=${template}`
    )
    managed('resize', '--size=2')
  }
  const replacement = await waitFor(
    'Waiting for replacement readiness in every backend',
    () => {
      const current = describe()
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
      const vms = instances()
      assert(
        vms.some((vm) => vm.instance === oldInstance),
        'Old VM changed during rollout'
      )
      const vm = vms.find(
        (vm) => vm.instance !== oldInstance && templateOf(vm) === template
      )
      return (
        vms.length === 2 &&
        vm &&
        running(vm) &&
        readyInEveryBackend(vm.instance) &&
        vm
      )
    }
  )

  // Health queries can take time. Recheck the group immediately before the
  // destructive step so another deploy cannot change which version survives.
  const beforeRemoval = describe()
  assert.equal(beforeRemoval.targetSize, 2, 'MIG size changed during rollout')
  assert.equal(
    beforeRemoval.updatePolicy?.type,
    'OPPORTUNISTIC',
    'MIG update policy changed during rollout'
  )
  assert.equal(
    desiredTemplate(beforeRemoval),
    template,
    'MIG template changed during rollout'
  )
  assert(
    !beforeRemoval.autoscaler ||
      beforeRemoval.autoscaler.autoscalingPolicy.mode === 'OFF',
    'Autoscaling was enabled during rollout'
  )
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

  log(
    `Replacement ${nameOf(replacement.instance)} is ready; removing ${nameOf(
      oldInstance
    )}`
  )
  // delete-instances reduces targetSize too. resize --size=1 could choose the
  // healthy replacement instead, so always name the old instance explicitly.
  managed('delete-instances', `--instances=${nameOf(oldInstance)}`)
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

module.exports = { rollout }
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
