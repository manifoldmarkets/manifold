# @manifold/data-license

Licensed-data export pipeline. Produces a versioned, pseudonymized Parquet
delivery for **one licensee per invocation** and uploads it to that licensee's
R2 bucket.

---

## 1. What it does

```
config → snapshot → (per table: stream → redact → chunk → scan → upload)
       → per-delivery README + manifest → done
```

- **Snapshot** — all six tables are read inside ONE `REPEATABLE READ`
  transaction (`db.ts`) so they are mutually consistent. Dedicated connection
  with the server timeouts disabled (the shared pool would kill a long export).
- **Scope** (`scope.ts`, `extract.ts`) — public, non-deleted contracts
  (`visibility='public' AND deleted=false`); the in-scope contract ids go into an
  indexed temp table, and every child table is an index-join against it (bets,
  comments, answers, liquidity). `txns` ship the **full ledger** minus rows
  referencing an out-of-scope contract (3-way predicate: CONTRACT-typed
  endpoints and `data.data.contractId` must each be in scope or absent) —
  platform-wide categories (transfers, bonuses, purchases, loans, prizes) are
  included; managram free text and external payment/merch metadata are stripped
  (`TXN_INNER_STRIP`), and payload contract references (`referredContractId`,
  loan `distributions`) are scrubbed against the scope set. `bot_accounts`
  ships the pseudonymized ids of bot-flagged accounts (`users.data.isBot`) so a
  licensee can filter algorithmic flow without a users table.
- **Redact** (`redact.ts`, `pseudonymize.ts`) — HMAC-SHA256 every user id
  (columns AND nested JSON: `contracts.data.answers[]`, comment `@mentions`,
  `txns.data.data`), strip denormalized identity (names/usernames/avatars/account
  age), scrub comment text (emails, phones, @mentions), redact deleted-account
  comments. `scope.ts` is the auditable catalog of every field touched. A final
  **raw-id sweep** then tokenizes every remaining string and pseudonymizes any
  token that is a real user id — the backstop for ids no field list can reach,
  e.g. a `manifold.markets/leagues/…/<uid>` URL pasted into a description.
- **Stream + chunk** (`extract.ts`, `writer.ts`) — server-side cursor
  (`pg-query-stream`); rows are written to zstd Parquet in ~fixed-size numbered
  parts (`contract_bets.0000.parquet`, …). Each part is scanned, hashed,
  uploaded, then deleted, so peak local disk is ~one part.
- **Validate** (`validate.ts`, `reconstruct.ts`) — every part is scanned before
  upload: referential integrity, zero raw user ids (tokens checked against the
  **complete** users id set, so a *missed* field is caught — and self-tested at
  startup with a planted id), a case-insensitive forbidden-string (client-name)
  denylist, and an **unknown-key gate**: every `data` key must be in the vetted
  allowlist in `scope.ts`, so an unvetted legacy field aborts the run instead of
  leaking silently. Plus a probability-path reconstruction spot check on the
  busiest resolved binary markets in scope. **Nothing uploads unless these pass.**
- **Manifest + README** (`manifest.ts`, `delivery-readme.ts`) — per-table row
  counts, per-part `{name, bytes, sha256}`, snapshot time, filter, segment tags
  (A/B/C), scrub stats, salt fingerprint, and the reconstruction result. A
  human-readable `README.md` ships in each delivery. The manifest is uploaded
  **last**, so its presence marks a complete, validated delivery.

Product segments (manifest tags; a future subset license is a manifest filter):
`A` reasoning-corpus = comments · `B` question-corpus = contracts + answers ·
`C` probability-series = bets + liquidity + txns + bot_accounts.

Parquet columns are typed (`COLUMN_TYPES` in `scope.ts`): timestamps are
`TIMESTAMPTZ` (UTC), monetary/probability fields `DOUBLE`, counts `BIGINT` —
without the override they'd land as VARCHAR, because pg serializes numerics and
timestamps as strings on the staging path. Search-index tsvector columns
(`*_fts`) are stripped.

---

## 2. Configuration (env)

There is no dotenv loader — export these into the process (locally: `set -a;
. ./.env; set +a`, or the Cloud Run job definition). Blank values are treated as
unset. See `.env.example`.

| Var | Meaning |
|---|---|
| `CLIENT_ID` | Opaque delivery id (manifest + local path only; never in the R2 key). |
| `DELIVERY_DATE` | `YYYY-MM-DD`; defaults to today. |
| `EXPORT_SALT` **or** `SALT_SECRET_RESOURCE` | Pseudonymization salt: a literal (local) **or** a Secret Manager version resource (cloud). Exactly one. **It's an HMAC key** — user ids are public, so a guessable salt lets anyone reverse the pseudonym map. Real deliveries need 32+ random bytes (`openssl rand -hex 32`), fixed per client forever. |
| `PSEUDONYM_PREFIX` / `PSEUDONYM_HEX_LEN` | Pseudonym format (default `User_`, 20 hex). |
| `DELETED_ACCOUNT_MODE` | `redact` (default) or `remove` for deleted-account comments. |
| `SEGMENTS` | Which segments to include, e.g. `A,B,C` (default all). |
| `ONLY_TABLES` | **Supplemental run**: rebuild only these tables (comma list) and *merge* the result into the delivery's existing manifest instead of replacing it — for repairing or adding one table without re-running a multi-hour export. See below. |
| `SUBSET_LIMIT` | Cap contracts pulled (for dry runs). Empty = full. |
| `CHUNK_ROWS` | Rows per Parquet part (default 250000). |
| `CHUNK_BYTES` | Staged NDJSON bytes per part (default 512MB); a part is cut on whichever of rows/bytes trips first. Rows alone are a bad proxy for wide-blob tables — 250k contracts is >700MB of JSON. |
| `LEAK_SCAN_FULL` | Have the **validator** check output tokens against the full users id set (default true). The set is always loaded regardless: redaction's raw-id sweep needs it. |
| `DRY_RUN` | `true` (default) uploads to a `_dryrun/<date>/` prefix; `false` = real `<date>/`. Note: dry runs still upload to the client's bucket if `R2_*` is set (visible to a customer read token) — leave `R2_*` unset to stay local, or use a scratch bucket. |
| `KEEP_LOCAL_PARTS` | Keep parts on disk after upload (default false). |
| `LOCAL_OUT_DIR` | Local staging dir (default `./out`). |
| `FORBIDDEN_STRINGS` **/** `FORBIDDEN_STRINGS_SECRET_RESOURCE` | Denylist (the licensee's real name/aliases) that must not appear in output. |
| `R2_BUCKET` | The **per-licensee** bucket. Required for upload. |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com`. A trailing bucket path is stripped by `r2.ts`, so the pipeline works either way — but the `aws` CLI does **not** strip it, so use the host-only form for any manual bucket surgery (see §6). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 credentials (read+write) for the job. |
| `SUPABASE_HOST` **or** `SUPABASE_INSTANCE_ID`, `SUPABASE_PASSWORD` | Source DB. Point at a PITR clone for real runs. |
| `LOAD_SECRETS`, `EXPORT_ENV`, `GOOGLE_APPLICATION_CREDENTIALS_{DEV,PROD}` | Local-only convenience to pull secrets via a service-account key (§3). |

### Supplemental runs (`ONLY_TABLES`)

Rebuild one table into an existing delivery, e.g. after fixing a bug that made a
table come out wrong or empty:

```bash
set -a; . ./.env; set +a
DELIVERY_DATE=2026-07-29 ONLY_TABLES=bot_accounts yarn dev   # pin the ORIGINAL date
```

The rebuilt table is uploaded, then the delivery's `manifest.json` is fetched
(the uploaded copy wins over the local one), the new table's entry is merged in,
and `README.md` + `manifest.json` are re-uploaded. Every other table's entry —
including its per-part sha256 list — is carried over untouched, and the
top-level `snapshotTime`, `scrubStats`, and `checks` keep describing the
ORIGINAL full run. The rebuilt table is stamped with its own `snapshotTime`, and
each supplemental run appends to a `supplementalRuns[]` array, so the manifest
never misrepresents what was read when.

This is safe across snapshots because pseudonyms are HMACs of a fixed per-client
salt: a table exported hours later still joins against the delivered ones.
That property is also the failure mode, so it is checked **before** any export
work happens — the run aborts if the existing manifest's `saltFingerprint`,
`deliveryDate`, or `schemaVersion` doesn't match, or if no manifest is there to
merge into (which is what stops a blank `DELIVERY_DATE` from silently opening a
fresh, half-empty delivery prefix at UTC midnight).

---

## 3. Running locally

Requires Node 20 (glibc — the DuckDB binding is glibc, matching the container).

The pipeline reads `SUPABASE_HOST`/`SUPABASE_PASSWORD` from the environment. For
convenience, `LOAD_SECRETS=true` pulls them (and other secrets) from Secret
Manager using a dev/prod service-account key — the same mechanism as
`backend/scripts` — so you don't need the DB password on hand.

```bash
cp backend/data-license/.env.example backend/data-license/.env   # fill in R2 etc.
set -a; . backend/data-license/.env; set +a

# subset dry run against dev, local-only (no R2), fast iteration on redaction:
LOAD_SECRETS=true EXPORT_ENV=DEV \
GOOGLE_APPLICATION_CREDENTIALS_DEV=$PWD/dev-mantic-markets-firebase-adminsdk.json \
SUPABASE_INSTANCE_ID=<dev-instance-id> \
CLIENT_ID=dev-test EXPORT_SALT=throwaway SUBSET_LIMIT=500 DRY_RUN=true \
LOCAL_OUT_DIR=/tmp/dl-out \
yarn --cwd backend/data-license dev
```

Set `SUBSET_LIMIT` small for a quick pass; leave `R2_*` unset to stay local-only
(parts are kept under `LOCAL_OUT_DIR/<clientId>/<date>/`). Add the `R2_*` vars to
also upload to a `_dryrun/<date>/` prefix.

Typecheck: `npx tsc --noEmit -p backend/data-license/tsconfig.json --skipLibCheck`.

---

## 4. Building & running as a Cloud Run Job

The build (run outside Docker) compiles a self-contained `dist/` tree; the
Dockerfile just installs prod deps and runs it. Base image is `node:20-slim`
(glibc) — a deliberate deviation from the repo's alpine images, because the
DuckDB binding ships glibc binaries.

```bash
# 1. build the flattened dist/
yarn --cwd backend/data-license build

# 2. build + push the image (glibc, linux/amd64) to Artifact Registry
cd backend/data-license
docker build --platform linux/amd64 -t \
  <region>-docker.pkg.dev/<project>/builds/data-license:$(git rev-parse --short HEAD) .
docker push <region>-docker.pkg.dev/<project>/builds/data-license:<tag>

# 3. create the job (memory 16Gi is plenty; timeout generous; small disk — we stream)
gcloud run jobs create data-license \
  --image <region>-docker.pkg.dev/<project>/builds/data-license:<tag> \
  --region <region> --memory 16Gi --cpu 4 --max-retries 0 --task-timeout 6h \
  --service-account <sa>@<project>.iam.gserviceaccount.com \
  --set-env-vars CLIENT_ID=<opaque>,R2_BUCKET=<client-bucket>,R2_ENDPOINT=<endpoint>,SEGMENTS=A,B,C,DRY_RUN=false,SUPABASE_HOST=<clone-host> \
  --set-env-vars SALT_SECRET_RESOURCE=projects/<n>/secrets/<salt-secret>/versions/latest \
  --set-secrets SUPABASE_PASSWORD=<clone-pw-secret>:latest,R2_ACCESS_KEY_ID=<secret>:latest,R2_SECRET_ACCESS_KEY=<secret>:latest,FORBIDDEN_STRINGS=<denylist-secret>:latest

# 4. run it (or attach to Cloud Scheduler for the monthly cadence)
gcloud run jobs execute data-license --region <region>
```

Notes:
- The job's **service account** needs `roles/secretmanager.secretAccessor` for the
  salt/denylist secrets. R2 creds and the clone DB password are injected as env
  from Secret Manager (`--set-secrets`).
- In the cloud, provide `SUPABASE_HOST` + `SUPABASE_PASSWORD` directly (the clone's
  own creds) — do **not** use `LOAD_SECRETS` (that's the local key-file path, and
  it would load *prod* secrets, not the clone's).
- Don't provision a big disk — the pipeline streams one part at a time. 16Gi
  memory covers DuckDB + one `CHUNK_ROWS` buffer + the users id set.
- Monthly cadence: point Cloud Scheduler at the job, or add a thin `createJob`
  entry in `backend/scheduler` that triggers this job (don't run the export inside
  the scheduler process).

Full-scale expectation (from a dev run, ~5,400 rows/s end-to-end): prod ≈ **3.5–4 h**
and **~6 GB** of Parquet. The DB load is modest (~10–20 MB/s reads) but the scan
runs for hours — see §5.

---

## 5. Spinning up the PITR clone (source DB)

Run real deliveries against an **ephemeral clone**, not the prod primary — a
multi-hour sequential scan on the live DB competes for disk throughput and
evicts hot pages from the buffer cache. The clone gives isolated compute, cache,
and disk; the single snapshot already guarantees consistency, so the clone is
purely for load isolation.

1. Supabase dashboard → source project → **Database → Backups → Restore to a new
   project** (paid plan + physical backups/PITR required). Pick the PITR
   timestamp. This creates a **new project** (database-only copy) in the same
   region.
2. On the clone, **disable `pg_net`, `pg_cron`, and `wrappers`** immediately —
   otherwise the clone's cron/webhook machinery fires against the real world.
3. Point the job at the clone: `SUPABASE_HOST=db.<new-project-ref>.supabase.co`
   and `SUPABASE_PASSWORD=<clone db password>` (store as a Secret Manager secret
   for the job).
4. Run the export. The clone holds full PII (it's a whole-DB copy) — treat it as
   sensitive and **delete the clone project promptly** once the delivery is
   verified.

There is no Management-API endpoint for restore-to-new-project as of writing, so
this step is a manual/semi-manual click at the monthly cadence (acceptable, since
a human reviews the delivery anyway). Alternative: run against the primary inside
the same single snapshot during a low-traffic window if you accept the load.

---

## 6. R2: per-licensee bucket + tokens

The bucket is the access boundary (R2 API tokens scope to buckets, not prefixes).

1. Cloudflare dashboard → **R2 → Create bucket**, one per licensee (name it with
   the opaque delivery id, not the real client name). Keep it private. Then add
   a lifecycle rule to auto-abort stale multipart uploads: a crashed run leaves
   an "ongoing multipart upload" holding its uploaded parts, which are billed as
   stored data and are invisible to `ListObjects`.

   Set this in the **Cloudflare dashboard** (R2 → the bucket → Settings → Object
   lifecycle rules → "Abort incomplete multipart uploads", 1 day). It can *not*
   be done with the job token: lifecycle is bucket-level configuration, and an
   Object Read & Write token gets `AccessDenied` on
   `PutBucketLifecycleConfiguration` (verified 2026-07-29). Use the dashboard or
   an Admin-scoped token.

   To clear one by hand instead: `list-multipart-uploads` → `abort-multipart-upload`
   with the `Key` + `UploadId` from that listing. **The `--endpoint-url` must be
   the account origin only** (`https://<accountid>.r2.cloudflarestorage.com`) — if
   you paste the endpoint with the bucket path appended, the CLI prepends the
   bucket name to the key and the abort fails with a misleading `NoSuchUpload`
   (the listing still works, which makes it look like R2 is at fault). `r2.ts`
   normalizes this for the pipeline; the CLI does not. Note R2 hands out a
   different `UploadId` string on every listing for the same upload — that's
   expected, and any freshly-listed one aborts fine.
2. **Job token** (for this pipeline): R2 → Manage API Tokens → create a token with
   **Object Read & Write**, scoped to that one bucket. Put its access key id +
   secret in Secret Manager and wire them into the job (`R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`). Endpoint: `https://<accountid>.r2.cloudflarestorage.com`.
3. **Customer token** (for the licensee): create a second token with **Object Read
   only**, scoped to the same bucket. This is what you hand over. Revoke it by
   deleting the token.

---

## 7. Sharing the delivery with the licensee

Give the customer three things: the S3 **endpoint**, the **bucket** name, and the
**read-only** access key id + secret from §6.3. They pull the whole delivery with
any S3 client and verify integrity against the manifest:

```bash
# using rclone or aws-cli (path-style, region auto)
aws s3 sync s3://<client-bucket>/<YYYY-MM-DD>/ ./delivery \
  --endpoint-url https://<accountid>.r2.cloudflarestorage.com

# then verify each file's sha256 against manifest.json
```

Or query in place with DuckDB (`INSTALL httpfs; SET s3_endpoint=…; SELECT * FROM
read_parquet('s3://…/contract_bets.*.parquet')`). Each delivery contains the
Parquet parts, a per-delivery `README.md` (column/segment/term definitions), and
`manifest.json` (row counts + per-file `sha256` for sync verification).

Dry-run artifacts live under `_dryrun/<date>/`; clear them before handing over a
bucket, or dry-run into a separate scratch bucket.

---

## 8. What the validator guarantees

Before any part is uploaded (per chunk, on the redacted rows about to be written):
- **Referential integrity** — every child `contract_id` exists in delivered contracts.
- **Zero raw user ids** — no token matching a real user id (full users set)
  survives. Self-tested at startup: a real id is planted in a fake row and the
  run aborts if the scan misses it.
- **No forbidden strings** — the licensee-name denylist appears nowhere
  (case-insensitive).
- **Unknown-key gate** — every `data` key (including inside `data.answers[]`
  and txn `data.data`) must be in the vetted allowlist in `scope.ts`. A key we
  haven't reviewed fails the chunk; vet it and add it to the catalog. This is
  what turns "surprise legacy field" from a silent leak into a loud abort.
- **Probability reconstruction** — the 5 busiest resolved binary markets in
  scope each have their `prob_before`/`prob_after` chain checked for continuity
  (per-market pass: no jump ≥ 0.02 and eps-level discontinuities rare). The gate
  is that a **strict majority** reconstruct, not all of them: prod contains
  markets whose bet series has genuine holes in the source data (verifiable in
  SQL with no export involved), while a real export defect corrupts every
  series. Final price vs. resolution is reported but not gated (resolution is a
  creator decision, not the last trade).

An empty table produces no Parquet file; the manifest records `rowCount: 0`,
`parts: 0` for it.

A failure aborts the run before completing the delivery (the manifest — the
completion marker — is never written/uploaded).
