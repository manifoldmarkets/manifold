# MEXAS Privy Setup Guide

This guide covers the MEXAS checkout rail on Manifold. It lets a signed-in
Manifold user connect or create a Privy wallet, transfer MEXAS on Arbitrum One,
and receive internal mana after the backend verifies the on-chain transfer.

## Token

MEXAS is configured as:

- Chain: Arbitrum One (`42161`)
- Token: `MEXAS Stablecoin`
- Symbol: `MEX`
- Decimals: `6`
- Contract: `0xc4c2ede4f6fd623acc86c492bdf099b3ba2b8303`
- Explorer: `https://arbiscan.io/token/0xc4c2ede4f6fd623acc86c492bdf099b3ba2b8303`

The conversion rate is `1 MEX = 100 mana`, with the existing first-crypto and
bulk crypto purchase bonuses applied.

## Flow

1. User signs in to Manifold.
2. User opens `/checkout` and connects or creates a Privy wallet.
3. The wallet is switched to Arbitrum One.
4. The user submits an ERC-20 `transfer` of MEX to your treasury wallet.
5. The wallet signs a Manifold purchase authorization message that includes the
   Arbitrum transaction hash.
6. The frontend waits for one Arbitrum confirmation.
7. The frontend calls `record-mexas-purchase` with the transaction hash, payer
   address, and wallet signature.
8. The backend verifies the wallet signature, fetches the Arbitrum receipt,
   verifies a matching MEX `Transfer` log, stores an idempotency row, and
   credits mana.

## Required Environment

Web frontend:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_MEXAS_TREASURY_WALLET_ADDRESS=0x...
NEXT_PUBLIC_ARBITRUM_RPC_URL=https://your-arbitrum-rpc.example
```

API backend:

```bash
MEXAS_TREASURY_WALLET_ADDRESS=0x...
ARBITRUM_RPC_URL=https://your-arbitrum-rpc.example
```

`NEXT_PUBLIC_ARBITRUM_RPC_URL` and `ARBITRUM_RPC_URL` are optional. If omitted,
the app uses `https://arb1.arbitrum.io/rpc`.

The public treasury address and backend treasury address must be the same. The
backend value is authoritative.

For GCP deployments, add `MEXAS_TREASURY_WALLET_ADDRESS` to Secret Manager. It
is included in `common/src/secrets.ts` so the API loads it into `process.env` at
startup.

## Deploy

Deploy the API after setting `MEXAS_TREASURY_WALLET_ADDRESS`:

```bash
cd backend/api
./deploy-api.sh prod
```

Deploy the frontend after setting `NEXT_PUBLIC_PRIVY_APP_ID` and
`NEXT_PUBLIC_MEXAS_TREASURY_WALLET_ADDRESS` in your hosting environment.

## Operational Notes

- Payments are idempotent by `mexas:<txHash>` in `crypto_payment_intents`.
- The backend does not trust the amount submitted by the browser; it reads the
  amount from the Arbitrum receipt logs.
- The backend verifies that the payer wallet signed a Manifold authorization
  message for the signed-in user and transaction hash before crediting mana.
- Users still need a Manifold account because mana balances and market actions
  remain internal database state.
- Privy handles wallet login and embedded wallet creation, not Manifold account
  replacement.
