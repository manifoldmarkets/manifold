# Daimo Pay Setup Guide

This guide covers setting up Daimo Pay for crypto-to-mana purchases on Manifold.

## Overview

Daimo Pay allows users to purchase mana using cryptocurrency (USDC) from any supported chain. The flow is:

1. User clicks "Buy mana with crypto" on `/crypto-to-mana`
2. Daimo modal opens, user pays from any chain
3. Daimo settles USDC to Manifold's hot wallet on Base
4. Daimo calls our webhook → backend credits mana to user (100 mana per $1 USDC)

## Prerequisites

- Daimo Pay account and API key (contact Daimo team)
- Access to GCP Secret Manager for both dev and prod projects
- Access to Supabase for both dev and prod

## 1. Get Daimo Credentials

1. Contact Daimo team to get:

   - **App ID** (e.g., `pay-manifoldmarkets-XXXXX`)
   - **Webhook secret** (Basic auth token for webhook authentication)

2. Set up your hot wallet address on Base to receive USDC payments

## 2. Configure Webhook in Daimo Dashboard

Create a webhook in Daimo's dashboard pointing to:

| Environment | Webhook URL                                         |
| ----------- | --------------------------------------------------- |
| Dev         | `https://api.dev.manifold.markets/v0/daimo-webhook` |
| Prod        | `https://api.manifold.markets/daimo-webhook`        |

Daimo will provide a Basic auth token when you create the webhook.

## 3. Set Up Secrets (GCP Secret Manager)

Add `DAIMO_WEBHOOK_SECRET` to GCP Secret Manager:

- **Dev**: [dev-mantic-markets secrets](https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets)
- **Prod**: [mantic-markets secrets](https://console.cloud.google.com/security/secret-manager?project=mantic-markets)

The value should be the Basic auth token provided by Daimo when you created the webhook.

The secret is already registered in `common/src/secrets.ts` and will be loaded automatically.

## 4. Set Up Frontend Environment Variables

Add to your deployment environment (Vercel):

| Variable                               | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_DAIMO_HOT_WALLET_ADDRESS` | Your hot wallet address on Base (e.g., `0x...`) |

This is used by the frontend to tell Daimo where to send payments.

## 5. Create Database Table

Run this SQL in Supabase for both dev and prod:

```sql
create table
  if not exists crypto_payment_intents (
    id bigint primary key generated always as identity not null,
    intent_id text not null,
    user_id text not null,
    created_time timestamp
    with
      time zone default now () not null,
      usdc_amount numeric(20, 6),
      mana_amount integer
  );

alter table crypto_payment_intents add constraint crypto_payment_intents_user_id_fkey foreign key (user_id) references users (id);

alter table crypto_payment_intents enable row level security;

create unique index crypto_payment_intents_intent_id_idx on public.crypto_payment_intents using btree (intent_id);

create index crypto_payment_intents_user_id_idx on public.crypto_payment_intents using btree (user_id);
```

This table is used for idempotency to prevent double-crediting mana if Daimo sends duplicate webhook calls.

## 6. Update Frontend App ID

In `web/pages/crypto-to-mana.tsx`, update the `appId` prop:

```tsx
<DaimoPayButton.Custom
  appId="pay-manifoldmarkets-XXXXX"  // Your actual app ID
  // ...
>
```

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

### Test Webhook Endpoint

```bash
# Test that endpoint is reachable (should return "Unauthorized")
curl -X POST https://api.manifold.markets/daimo-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'

# Test with auth (should return "success")
curl -X POST https://api.manifold.markets/daimo-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YOUR_WEBHOOK_SECRET" \
  -d '{
    "type": "payment_completed",
    "paymentId": "test-123",
    "payment": {
      "id": "test-123",
      "destination": { "amountUnits": "1" },
      "metadata": { "userId": "YOUR_USER_ID" }
    }
  }'
```

### Check Logs

- **Dev logs**: [GCP Logs Explorer (dev)](https://console.cloud.google.com/logs/query?project=dev-mantic-markets)
- **Prod logs**: [GCP Logs Explorer (prod)](https://console.cloud.google.com/logs/query?project=mantic-markets)

Filter for webhook logs:

```
"daimo" OR "webhook" OR "/daimo-webhook"
```

## Troubleshooting

| Error                                | Cause                             | Fix                                     |
| ------------------------------------ | --------------------------------- | --------------------------------------- |
| `Webhook not configured`             | `DAIMO_WEBHOOK_SECRET` not in GCP | Add secret to Secret Manager            |
| `Unauthorized`                       | Wrong auth token                  | Verify token matches what Daimo sends   |
| `pgPromise background error`         | Table doesn't exist               | Run SQL migration in Supabase           |
| `Missing userId in payment metadata` | Frontend not sending userId       | Check `metadata` prop on DaimoPayButton |

## File Locations

| File                                          | Purpose                           |
| --------------------------------------------- | --------------------------------- |
| `web/pages/crypto-to-mana.tsx`                | Frontend page with DaimoPayButton |
| `web/components/crypto/crypto-providers.tsx`  | Wagmi/Daimo providers             |
| `backend/api/src/daimo-webhook.ts`            | Webhook handler                   |
| `backend/api/src/old-routes.ts`               | Route registration                |
| `backend/supabase/crypto_payment_intents.sql` | Database schema                   |
| `common/src/secrets.ts`                       | Secret registration               |
| `common/src/economy.ts`                       | `CRYPTO_MANA_PER_DOLLAR` constant |
