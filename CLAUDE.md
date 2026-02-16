# Manifold CLAUDE.md — Power User Configuration

## Monorepo Architecture

This is a TypeScript monorepo with strict package isolation:

| Package | Role | Can Import From |
|---------|------|-----------------|
| `common/` | Shared types, market math, utilities | *nothing* (leaf package) |
| `web/` | Next.js 16 frontend (React 19) | `common/`, `client-common/` |
| `backend/api/` | Express API (256 endpoints) | `common/`, `backend/shared/` |
| `backend/shared/` | Backend utilities, DB helpers, notifications | `common/` |
| `backend/scheduler/` | Cron jobs (Croner) | `common/`, `backend/shared/` |
| `backend/scripts/` | One-off maintenance scripts | `common/`, `backend/shared/` |
| `native/` | Minimal React Native shell | — |
| `mani/` | Unused | — |

**Import rules are absolute:**
- `web` and `backend` NEVER import from each other.
- `common` NEVER imports from `web` or `backend`.
- All core types (`Contract`, `User`, `Bet`, `Answer`, `Group`, `Fees`) live in `common/src/`.
- All market math (CPMM logic) lives in `common/src/calculate-cpmm.ts` and related files.
- API schemas live in `common/src/api/schema.ts` (Zod-validated).

## Gemini Protocol — Tiered Intelligence (AI Ultra)

Subscription: Google AI Ultra ($200/mo). Preview models are enabled. Use the right tier for the job to conserve Ultra quota.

### Tier 1: Ultra / DeepThink Mode

Use for **high-stakes logic** — CPMM math, fee calculations, arbitrage, tax engines, or any change where a wrong answer costs money.

```sh
gemini -m gemini-3-pro-preview "@common/src/calculate-cpmm.ts" "@common/src/fees.ts" "Think deeply and provide a rigorous technical plan for: [task]"
gemini -m gemini-3-pro-preview "@web/**" "@common/**" "Think deeply and provide a rigorous technical plan for: [task]"
```

When to use: trading logic, limit order changes, liquidity math, cross-package type refactors, financial calculations, anything touching the AMM invariant.

### Tier 2: Flash / Agent Mode

Use for **routine work** — file mapping, boilerplate scaffolding, dependency graphs, search-and-list tasks.

```sh
gemini -m gemini-3-flash-preview "@web/**" "Plan: [task]"
gemini -m gemini-3-flash-preview "@backend/api/src/**" "List all endpoints that import from common/bet"
```

When to use: finding files, mapping imports, generating component skeletons, understanding folder structure, simple refactors.

### Tier Selection Rule

Default to **Flash**. Escalate to **Ultra** when the task involves financial math, cross-package type changes, or any logic where an error has monetary or data-integrity consequences.

### Post-Gemini Validation (Mandatory)

After Gemini provides a plan, Claude MUST review it before editing any files:

1. **Dependency check:** Verify every import path Gemini references actually exists (`Glob`/`Grep` the codebase).
2. **Hallucination filter:** Flag any function names, types, or file paths that don't match the real codebase.
3. **Scope guard:** Confirm the plan doesn't touch files outside the stated task boundary.

Only proceed to code edits after all three checks pass. If Gemini hallucinated a dependency, discard that part of the plan and re-derive it from the actual source.

## Market Logic Integrity

The CPMM (Constant Product Market Maker) math is the financial core of the platform. Key files:

| File | Purpose |
|------|---------|
| `common/src/calculate-cpmm.ts` | AMM: probability, shares, purchases, fees |
| `common/src/calculate-cpmm-arbitrage.ts` | Multi-choice arbitrage detection |
| `common/src/calculate.ts` | Probability display helpers |
| `common/src/calculate-fixed-payouts.ts` | Non-AMM payout logic |
| `common/src/calculate-metrics.ts` | Portfolio & investment metrics |
| `common/src/fees.ts` | Fee structure (currently zeroed) |
| `common/src/add-liquidity.ts` | Subsidy pool math |
| `common/src/new-bet.ts` | CandidateBet construction |

**Rules:**
- NEVER duplicate market math. Always import from `common/src/calculate-cpmm.ts`.
- Any change to trading logic, limit orders, or arbitrage calculations MUST pass existing tests: `cd common && yarn test`.
- Key test files: `calculate-cpmm.test.ts`, `calculate-cpmm-arbitrage.test.ts`, `leagues.test.ts`.
- Use defensive numeric checks (`Number.isFinite`) for all financial calculations to avoid floating-point errors.
- The AMM invariant is `y^p * n^(1-p) = k`. Do not alter this without understanding the full implications.

## Ban & Moderation System

The platform uses a granular ban system. Respect it in all user-action endpoints.

### Ban Types (`common/src/ban-utils.ts`, `common/src/user.ts`)

| Ban Type | Blocks |
|----------|--------|
| `posting` | Comments, messages, posts, answers, poll votes, managrams |
| `marketControl` | Create/edit/resolve markets, hide comments, add/edit answers, poll voting, add topics |
| `trading` | Betting, managrams, liquidity changes, adding answers, poll voting |
| `modAlert` | No actions blocked — audit/warning only |

### Adding Ban Checks to New Endpoints

Use the `onlyUsersWhoCanPerformAction` wrapper:

```typescript
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const myEndpoint: APIHandler<'my-endpoint'> = onlyUsersWhoCanPerformAction(
  'actionName',  // Must exist in getBanTypesForAction() in common/src/ban-utils.ts
  async (props, auth, req) => { /* ... */ }
)
```

Register the action in `common/src/ban-utils.ts` → `getBanTypesForAction()`.

### Admin Checks

```typescript
import { isAdminId, isModId } from 'common/envs/constants'
// CORRECT: isAdminId(user.id)
// WRONG:  user.isAdmin (does not exist)
```

## Tailwind & UI Standards

- **Utility-first Tailwind CSS** with class-based dark mode (`darkMode: ['class']`).
- Color tokens use CSS variables: `ink-*` (text), `canvas-*` (backgrounds), `primary-*` (theme), `yes`/`no` (outcomes).
- `ink`, `canvas`, `primary`, `teal`, `scarlet` auto-adapt to dark mode. Use these over raw color classes.
- Fonts: `figtree` (main), `grenze-gotisch` (match cards), `mana` (icon font).
- Use Headless UI (v2.2+) for dropdowns/popovers. Use TipTap for rich text.
- Design reference: `web/pages/styles.tsx`.
- Run Prettier with the tailwindcss plugin for consistent class ordering.
- All new UI must be responsive and respect dark mode.

## API Endpoint Pattern

To add a new endpoint:

1. Define schema in `common/src/api/schema.ts` (Zod props + return type, POST or GET only).
2. Create handler in `backend/api/src/<endpoint-name>.ts` using `APIHandler<'endpoint-name'>`.
3. Register in `backend/api/src/routes.ts`.

Database access: Use `createSupabaseDirectClient()` (pg-promise, raw SQL). The Supabase REST client (`createSupabaseClient()`) is **deprecated** for new backend code.

```typescript
// CORRECT (backend):
const pg = createSupabaseDirectClient()
await pg.manyOrNone(`select id from contracts where slug = $1`, [slug])

// DEPRECATED (do not use for new backend code):
const db = createSupabaseClient()
```

SQL style: lowercase keywords, parameterized queries (never `${}`), use `renderSql` builder from `shared/supabase/sql-builder.ts` for complex queries.

## Frontend Patterns

- **Client data fetching:** Use `useAPIGetter` hook (caches in memory, supports `refresh()`).
- **Live updates:** Use `useApiSubscription` for WebSocket topics (`contract/*/new-bet`, `global`, etc.).
- **State:** Prefer `usePersistentInMemoryState` over `useState` for nav-persistent state.
- **Server data:** Use Supabase client directly in `getStaticProps`/`getServerSideProps` (API client requires auth).
- **Imports:** External libraries first, blank line, then internal imports (`common/`, `web/`, `client-common/`).
- **Lodash over loops:** Use `keyBy`, `uniq`, `sortBy`, etc. instead of manual iteration.
- **No Set iteration:** ES5 target — use `lodash/uniq` instead of `for...of` on Sets.
- **Error handling:** Use `error instanceof Error ? error.message : String(error)` pattern.

## Component Conventions

- Many small, composable components > one monolithic component.
- Export the main component at the top of the file.
- Name the component to match the file name (e.g., `HeadlineTabs` in `headline-tabs.tsx`).
- Mana/Sweepstakes markets share a page — pass minimal props, keep market-type logic in containers.

## Scripts

Run scripts via `ts-node` inside the `runScript` helper (auto-loads secrets):

```typescript
import { runScript } from 'run-script'
runScript(async ({ pg }) => { /* ... */ })
```

## Key Constants & References

- House liquidity provider: `HOUSE_LIQUIDITY_PROVIDER_ID` in `common/antes.ts`
- Environment config: `common/envs/constants.ts` (`ENV_CONFIG`, `SWEEPIES_NAME`, admin/mod ID checks)
- Supabase schema (autogenerated): `common/src/api/schema.ts` (~91KB)
- DB migrations: `backend/supabase/migrations/`
