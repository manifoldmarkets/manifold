import { randomUUID } from 'crypto'
import { PRE_KYC_STARTING_BALANCE } from 'common/economy'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getUser, log } from 'shared/utils'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  tenantSchemaStorage,
} from 'shared/supabase/init'
import { cloneSchemaForInstance } from 'shared/supabase/clone-schema'
import { insert } from 'shared/supabase/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'

const MAX_INSTANCES_PER_USER = 3
const MIN_SUBDOMAIN_LENGTH = 3
const MAX_SUBDOMAIN_LENGTH = 32
const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'dev',
  'app',
  'mail',
  'ftp',
  'static',
  'assets',
  'cdn',
  'docs',
  'blog',
  'status',
  'help',
  'support',
  'staging',
  'localhost',
  'manifold',
  'test',
  'demo',
])

export const createInstance: APIHandler<'create-instance'> = async (
  { name },
  auth
) => {
  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')

  const pg = createSupabaseDirectClient()

  const activeCount = await pg.one<number>(
    `select count(*) from instances where owner_id = $1 and status = 'active'`,
    [auth.uid],
    (r) => r.count
  )
  if (activeCount >= MAX_INSTANCES_PER_USER) {
    throw new APIError(
      403,
      `You can only have ${MAX_INSTANCES_PER_USER} private instances at a time.`
    )
  }

  const subdomain = await getAvailableSubdomain(pg, name)
  const instanceId = randomUUID().replace(/-/g, '')
  const schemaName = `instance_${instanceId}`

  log('Creating private instance', { subdomain, schemaName, owner: auth.uid })

  await cloneSchemaForInstance(pg, schemaName)

  await pg.none(
    `insert into instances (id, subdomain, schema_name, name, owner_id)
     values ($1, $2, $3, $4, $5)`,
    [instanceId, subdomain, schemaName, name, auth.uid]
  )

  // Seed the creator's profile inside their new, empty instance with a
  // fresh starting balance — mirrors the pre-KYC top-up a brand new
  // Manifold account receives (see shared/create-user-main.ts), but reuses
  // the caller's existing identity instead of creating a new Firebase user.
  await tenantSchemaStorage.run({ schema: schemaName }, () =>
    pg.tx(async (tx) => {
      await insert(tx, 'users', {
        id: creator.id,
        name: creator.name,
        username: creator.username,
        data: {
          avatarUrl: creator.avatarUrl,
          streakForgiveness: 0,
          shouldShowWelcome: true,
          creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
          signupBonusPaid: 0,
        },
      })

      await runTxnFromBank(tx, {
        fromType: 'BANK',
        toId: creator.id,
        toType: 'USER',
        amount: PRE_KYC_STARTING_BALANCE,
        token: 'M$',
        category: 'PRE_KYC_BONUS',
        description: `Starting balance for private instance "${name}"`,
      })
    })
  )

  return { status: 'success', subdomain, instanceId }
}

async function getAvailableSubdomain(pg: SupabaseDirectClient, name: string) {
  let base = slugify(name, '-', MAX_SUBDOMAIN_LENGTH)
  if (
    base.length < MIN_SUBDOMAIN_LENGTH ||
    !SUBDOMAIN_RE.test(base) ||
    RESERVED_SUBDOMAINS.has(base)
  ) {
    base = `instance-${randomString(6)}`
  }

  let candidate = base
  while (
    RESERVED_SUBDOMAINS.has(candidate) ||
    (await pg.oneOrNone(`select 1 from instances where subdomain = $1`, [
      candidate,
    ]))
  ) {
    candidate = `${base}-${randomString(4)}`.slice(0, MAX_SUBDOMAIN_LENGTH)
  }
  return candidate
}
