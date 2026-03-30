# Daimo Pay Setup Guide

This guide covers setting up Daimo Pay for crypto-to-mana purchases on Manifold using Daimo's session-based SDK.

## Overview

Daimo Pay allows users to purchase mana using cryptocurrency (USDC) from any supported chain. The flow is:

1. User clicks "Buy mana" on `/checkout`
2. Frontend calls our `create-daimo-session` API endpoint
3. Backend creates a Daimo session via `POST https://api.daimo.com/v1/sessions` with Bearer API key auth
4. Backend returns `sessionId` and `clientSecret` to frontend
5. Frontend renders `DaimoModal` with the session credentials
6. User selects payment method and pays via the Daimo modal
7. Daimo calls our webhook with `session.succeeded` event
8. Backend verifies HMAC signature and credits mana to user (100 mana per $1 USDC)

## Prerequisites

- Daimo Pay account and API key (contact Daimo team)
- Access to GCP Secret Manager for both dev and prod projects
- Access to Supabase for both dev and prod

## 1. Get Daimo Credentials

Contact the Daimo team to get:

- **API Key** (UUID format) - used server-side to create sessions

## 2. Register Webhook Endpoint

Register your webhook endpoint via the Daimo API:

```bash
curl -X POST https://api.daimo.com/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.manifold.markets/daimo-webhook",
    "events": ["session.succeeded"],
    "description": "Manifold mana fulfillment"
  }'
```

The response includes a `webhook.secret` - **save this securely**, it's only shown once. This HMAC secret is used to verify webhook signatures.

| Environment | Webhook URL                                      |
| ----------- | ------------------------------------------------ |
| Dev         | `https://api.dev.manifold.markets/daimo-webhook` |
| Prod        | `https://api.manifold.markets/daimo-webhook`     |

## 3. Set Up Secrets (GCP Secret Manager)

Add the following secrets to GCP Secret Manager:

- **Dev**: [dev-mantic-markets secrets](https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets)
- **Prod**: [mantic-markets secrets](https://console.cloud.google.com/security/secret-manager?project=mantic-markets)

| Secret                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `DAIMO_API_KEY`        | Bearer token for creating sessions             |
| `DAIMO_WEBHOOK_SECRET` | HMAC secret from webhook registration response |
| `DAIMO_HOT_WALLET_ADDRESS` | Hot wallet address on Base to receive USDC |

These secrets are registered in `common/src/secrets.ts` and will be loaded automatically.

## 4. Database Table

The `crypto_payment_intents` table is used for idempotency to prevent double-crediting mana. It stores `intent_id` (now the Daimo `sessionId`) as the unique key.

See `backend/supabase/crypto_payment_intents.sql` for the schema.

## 5. Session Lifecycle

Daimo sessions follow this lifecycle (handled automatically by `DaimoModal`):

1. `requires_payment_method` - Session created, waiting for user to choose how to pay
2. `waiting_payment` - Payment method set, waiting for deposit transaction
3. `processing` - Deposit detected, funds being routed to destination
4. Terminal states:
   - `succeeded` - Funds delivered to destination (triggers webhook)
   - `bounced` - Delivery failed, funds returned to refund address
   - `expired` - Session timed out

## 6. Webhook Verification

The webhook uses HMAC-SHA256 signature verification:

1. Daimo sends `Daimo-Signature` header with format: `t=<timestamp>,v1=<hmac_hex>`
2. Backend computes `HMAC_SHA256("${t}.${rawBody}")` with `DAIMO_WEBHOOK_SECRET`
3. Backend compares signatures using `crypto.timingSafeEqual`
4. Rejects timestamps older than 5 minutes to prevent replay attacks

Event types:
- `session.processing` - Ignored (just for UI feedback)
- `session.succeeded` - Triggers mana crediting
- `session.bounced` - Logged for visibility, no mana credited

Test events include `isTestEvent: true` and are acknowledged but don't trigger mana crediting.

## 7. Deploy

### Deploy API

```bash
# Dev
cd backend/api && ./deploy-api.sh dev

# Prod
cd backend/api && ./deploy-api.sh prod
```

### Deploy Frontend

Deploy via your normal frontend deployment process (Vercel).

## Testing

### Send Test Webhook Event

```bash
curl -X POST https://api.daimo.com/v1/webhooks/{webhookId}/test \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "session.succeeded"}'
```

Test events contain `isTestEvent: true` and won't credit mana.

### Check Logs

- **Dev logs**: [GCP Logs Explorer (dev)](https://console.cloud.google.com/logs/query?project=dev-mantic-markets)
- **Prod logs**: [GCP Logs Explorer (prod)](https://console.cloud.google.com/logs/query?project=mantic-markets)

Filter for webhook logs:

```
"daimo" OR "webhook" OR "/daimo-webhook" OR "session.succeeded"
```

## Troubleshooting

| Error                                  | Cause                               | Fix                                          |
| -------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `Webhook not configured`               | `DAIMO_WEBHOOK_SECRET` not in GCP   | Add secret to Secret Manager                 |
| `Missing signature`                    | `Daimo-Signature` header missing    | Check webhook registration                   |
| `Invalid signature`                    | Wrong secret or tampered body       | Verify `DAIMO_WEBHOOK_SECRET` matches Daimo  |
| `Crypto payment service not configured`| `DAIMO_API_KEY` or hot wallet missing | Add secrets to GCP                          |
| `Missing userId in session metadata`   | Session created without userId      | Check `create-daimo-session` endpoint        |

## File Locations

| File                                          | Purpose                              |
| --------------------------------------------- | ------------------------------------ |
| `web/pages/checkout.tsx`                      | Frontend checkout with DaimoModal    |
| `web/components/crypto/crypto-providers.tsx`  | DaimoSDKProvider wrapper             |
| `backend/api/src/create-daimo-session.ts`     | Session creation endpoint            |
| `backend/api/src/daimo-webhook.ts`            | Webhook handler with HMAC verification |
| `backend/api/src/old-routes.ts`               | Route registration                   |
| `backend/supabase/crypto_payment_intents.sql` | Database schema                      |
| `common/src/secrets.ts`                       | Secret registration                  |
| `common/src/api/schema.ts`                    | API schema for create-daimo-session  |
| `common/src/economy.ts`                       | `CRYPTO_MANA_PER_DOLLAR` constant    |

## References

- [Daimo Quickstart](https://docs.daimo.com/quickstart)
- [Daimo API Overview](https://docs.daimo.com/api-reference/overview)
- [Daimo Sessions](https://docs.daimo.com/guides/sessions)
- [Daimo Modal](https://docs.daimo.com/guides/modal)
- [Daimo Webhooks](https://docs.daimo.com/guides/webhooks)
