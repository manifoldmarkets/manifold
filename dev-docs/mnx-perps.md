# MNX perpetual feeds

Adapter architecture is documented in
[the perps README](../backend/shared/src/perps/README.md#mnx-marks-2-second-bulk-adapter).
DEV and PROD rollout commands, validation and deployment order live in
[the PERP launch runbook](../perps-launch-runbook.md#mnx-rollout-dev-and-prod).

The integration uses the shared 2-second oracle tick and requires no MNX migration.

## Per-user invites

The MNX market CTAs and tracked chart credits open `/mnx?feedId=...&location=...`
in a new tab. That page waits for authentication, then calls the authenticated
`POST /v0/get-mnx-invite-link` endpoint. The backend looks up the current username
using the authenticated user ID and returns the instrument's MNX URL with the
existing UTM tags plus `u` (username) and `t` (token). Signed-out visitors continue
to the ordinary tagged MNX URL. A signing failure offers a retry instead of
silently dropping a signed-in user's invite. Click analytics retain the unsigned
destination URL so tokens are not stored in `user_events`.

In the native iOS and Android apps, the link instead fetches its signed URL
inside the authenticated WebView before it can be opened. Its `_blank` href is
the final external MNX URL, which the existing native `onOpenWindow` handler
opens in the system browser. Native never receives the same-origin `/mnx` URL
(the handler ignores it), and signing does not depend on the system browser
sharing the app's login. While auth or signing is pending, taps show a loading
message; failed requests can be retried by tapping again. Results are scoped to
the user and destination and discarded when either changes. No native binary
update is required.

The agreed protocol is:

```text
shared_key = md5("mnx" + API_SECRET)
t = md5(username + shared_key)
```

Both hashes use UTF-8 input and lowercase hexadecimal output; concatenate the
32-character inner hex string, not raw digest bytes. Preserve username case and
hash before URL encoding. MNX URL-decodes `u`, computes `md5(u + shared_key)`, and
compares it with `t` (validate 32 hex characters, then compare in constant time).
MNX should reuse the same invite on repeated visits for that username. Tokens
have no expiry; username changes change the token and invite identity.

Before rollout, securely give MNX **only** the derived `shared_key` for the
environment being used. `API_SECRET` stays on Manifold's backend. No new secret
is required. In a backend environment where `API_SECRET` is already loaded, the
derived value can be obtained with:

```js
const { createHash } = require('crypto')
if (!process.env.API_SECRET) throw new Error('Missing API_SECRET')
const sharedKey = createHash('md5')
  .update('mnx' + process.env.API_SECRET, 'utf8')
  .digest('hex')
```

Treat that value as a signing secret. Rotating `API_SECRET` changes it, so
coordinate rotation with MNX. Deploy the backend endpoint before the web change.

Interoperability vector (dummy secret): `API_SECRET = "test-api-secret"` gives
`shared_key = "135cdade7d1422347e3f9a0475d52a8c"`; username `Alice` gives
`t = "d54992bbbb2e77158f474821f396e372"`.
