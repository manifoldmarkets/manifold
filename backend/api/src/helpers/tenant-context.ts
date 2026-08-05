// Resolves the current request's private Manifold instance (if any) to a
// Postgres schema, and runs the rest of the request inside that schema's
// tenant context (see tenantSchemaStorage in shared/supabase/init.ts).
// Requests for the main manifold.markets/dev site pass through untouched.
//
// The instance is identified two ways, both derived from the request's
// subdomain by web code:
//  - `X-Manifold-Instance` header — set by common/src/util/api.ts for
//    client-side calls, and by web/proxy.ts for server-rendered pages.
//  - `instance` query param — set by web/proxy.ts on the 308 redirect it
//    issues for the public /api/* path; a redirect response's headers don't
//    survive onto the browser's follow-up request, so that path can't use
//    the header.
import { NextFunction, Request, RequestHandler, Response } from 'express'
import {
  createSupabaseDirectClient,
  tenantSchemaStorage,
} from 'shared/supabase/init'

const INSTANCE_HEADER = 'x-manifold-instance'
const CACHE_TTL_MS = 30_000

type CacheEntry = { schemaName: string | null; expiresAt: number }
const instanceCache = new Map<string, CacheEntry>()

async function resolveSchemaName(subdomain: string): Promise<string | null> {
  const cached = instanceCache.get(subdomain)
  if (cached && cached.expiresAt > Date.now()) return cached.schemaName

  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone<{ schema_name: string }>(
    `select schema_name from instances where subdomain = $1 and status = 'active'`,
    [subdomain]
  )
  const schemaName = row?.schema_name ?? null
  instanceCache.set(subdomain, { schemaName, expiresAt: Date.now() + CACHE_TTL_MS })
  return schemaName
}

export const tenantContextMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const subdomain = req.get(INSTANCE_HEADER) || (req.query.instance as string)
  // Don't let this leak into endpoint prop validation (GET endpoints spread
  // req.query into their validated props, and most schemas are `.strict()`).
  delete req.query.instance

  if (!subdomain) {
    next()
    return
  }

  resolveSchemaName(subdomain)
    .then((schemaName) => {
      if (!schemaName) {
        res.status(404).json({
          message: `No private Manifold instance found for subdomain "${subdomain}".`,
        })
        return
      }
      tenantSchemaStorage.run({ schema: schemaName }, next)
    })
    .catch(next)
}
