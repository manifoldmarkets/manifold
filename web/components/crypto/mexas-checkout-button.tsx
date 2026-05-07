'use client'

import { ExternalLinkIcon } from '@heroicons/react/solid'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import clsx from 'clsx'
import {
  getMexasPurchaseMessage,
  MEXAS_MANA_PER_TOKEN,
  MEXAS_TOKEN,
} from 'common/crypto/mexas'
import {
  CRYPTO_BULK_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_THRESHOLD_DISPLAY,
  CRYPTO_FIRST_PURCHASE_BONUS_PCT,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createWalletClient,
  custom,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { arbitrum } from 'viem/chains'
import { Button } from 'web/components/buttons/button'
import { usePrivyWalletConfig } from 'web/components/crypto/privy-wallet-providers'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import {
  formatMexasUnits,
  getArbiscanTxUrl,
  getMexasBalanceUnits,
  mexasErc20Abi,
  mexasPublicClient,
} from 'web/lib/crypto/mexas'

type CheckoutState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'confirming'; txHash: Hex }
  | {
      status: 'credited' | 'already-processed'
      txHash: Hex
      manaAmount: number
    }
  | { status: 'error'; message: string; txHash?: Hex }

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'MEXAS payment failed. Please try again.'
}

function MissingPrivyConfig(props: { missingEnv: string[] }) {
  return (
    <Col className="border-ink-200 bg-canvas-50 text-ink-600 gap-2 rounded-lg border p-3 text-sm">
      <div className="font-semibold">Privy wallet is not configured.</div>
      <div>Set {props.missingEnv.join(', ')} before deploying this rail.</div>
    </Col>
  )
}

export function MexasCheckoutButton(props: {
  disabled?: boolean
  onCompleted: () => void
}) {
  const config = usePrivyWalletConfig()
  if (!config.configured) {
    return <MissingPrivyConfig missingEnv={config.missingEnv} />
  }

  return <MexasCheckoutButtonInner {...props} />
}

function MexasCheckoutButtonInner(props: {
  disabled?: boolean
  onCompleted: () => void
}) {
  const treasuryAddress = process.env.NEXT_PUBLIC_MEXAS_TREASURY_WALLET_ADDRESS
  const manifoldUser = useUser()
  const { ready, authenticated, login } = usePrivy()
  const { createWallet } = useCreateWallet()
  const { wallets, ready: walletsReady } = useWallets()
  const [amount, setAmount] = useState('10')
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    status: 'idle',
  })
  const [balanceUnits, setBalanceUnits] = useState<bigint | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  const wallet = wallets.find((wallet) => wallet.walletClientType === 'privy')
  const walletAddress = wallet?.address as Address | undefined
  const amountUnits = useMemo(() => {
    const value = amount.trim()
    if (!/^\d+(\.\d{1,6})?$/.test(value)) return null
    try {
      return parseUnits(value, MEXAS_TOKEN.decimals)
    } catch {
      return null
    }
  }, [amount])

  const hasValidAmount = amountUnits !== null && amountUnits > 0n
  const hasEnoughBalance =
    balanceUnits === null || amountUnits === null || balanceUnits >= amountUnits
  const loading =
    checkoutState.status === 'submitting' ||
    checkoutState.status === 'confirming'
  const configuredTreasury =
    typeof treasuryAddress === 'string' && isAddress(treasuryAddress)
  const disabled =
    props.disabled ||
    loading ||
    !hasValidAmount ||
    !hasEnoughBalance ||
    !configuredTreasury

  const baseMana = hasValidAmount
    ? Math.floor(Number(amount) * MEXAS_MANA_PER_TOKEN)
    : 0
  const bonusPct =
    Number(amount) >= CRYPTO_BULK_THRESHOLD_DISPLAY
      ? CRYPTO_BULK_PURCHASE_BONUS_PCT
      : 0
  const displayedMana = baseMana + Math.floor(baseMana * bonusPct)

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return
    setBalanceError(null)
    try {
      setBalanceUnits(await getMexasBalanceUnits(walletAddress))
    } catch (error) {
      console.error('Failed to read MEXAS balance', error)
      setBalanceError('Could not load MEX balance.')
    }
  }, [walletAddress])

  useEffect(() => {
    refreshBalance()
  }, [refreshBalance])

  const submitPayment = async () => {
    if (!ready || props.disabled) return

    if (!authenticated) {
      login()
      return
    }

    if (!wallet) {
      setCheckoutState({ status: 'submitting' })
      try {
        await createWallet()
        setCheckoutState({ status: 'idle' })
      } catch (error) {
        setCheckoutState({ status: 'error', message: getErrorMessage(error) })
      }
      return
    }

    if (!manifoldUser?.id) {
      setCheckoutState({
        status: 'error',
        message: 'Sign in to Manifold before paying with MEXAS.',
      })
      return
    }

    if (!amountUnits || amountUnits <= 0n) {
      setCheckoutState({ status: 'error', message: 'Enter a MEX amount.' })
      return
    }

    if (!configuredTreasury) {
      setCheckoutState({
        status: 'error',
        message: 'MEXAS treasury wallet is not configured.',
      })
      return
    }

    let submittedTxHash: Hex | undefined = undefined
    setCheckoutState({ status: 'submitting' })
    try {
      await wallet.switchChain(MEXAS_TOKEN.chainId)
      const provider = await wallet.getEthereumProvider()
      const walletClient = createWalletClient({
        account: wallet.address as Address,
        chain: arbitrum,
        transport: custom(provider),
      })
      const payerAddress = wallet.address.toLowerCase()
      const txHash = await walletClient.writeContract({
        address: MEXAS_TOKEN.address as Address,
        abi: mexasErc20Abi,
        functionName: 'transfer',
        args: [treasuryAddress as Address, amountUnits],
      })
      submittedTxHash = txHash
      const signature = await walletClient.signMessage({
        account: wallet.address as Address,
        message: getMexasPurchaseMessage(manifoldUser.id, txHash, payerAddress),
      })

      setCheckoutState({ status: 'confirming', txHash })
      await mexasPublicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })

      const result = await api('record-mexas-purchase', {
        txHash,
        payerAddress,
        signature,
      })
      setCheckoutState({
        status: result.status,
        txHash,
        manaAmount: result.manaAmount,
      })
      await refreshBalance()
      props.onCompleted()
    } catch (error) {
      setCheckoutState({
        status: 'error',
        message: getErrorMessage(error),
        txHash: submittedTxHash,
      })
    }
  }

  if (!ready || !walletsReady) {
    return (
      <Button className="w-full" color="indigo" size="lg" disabled>
        <LoadingIndicator size="sm" className="mr-2 !text-white" />
        Loading wallet...
      </Button>
    )
  }

  if (!authenticated) {
    return (
      <Button
        className="w-full"
        color="indigo"
        size="lg"
        disabled={props.disabled}
        onClick={() => login()}
      >
        Connect Privy wallet
      </Button>
    )
  }

  return (
    <Col className="border-ink-200 gap-3 rounded-lg border p-3">
      <Row className="items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-ink-600 mb-1 block text-xs font-medium">
            MEX amount
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            inputMode="decimal"
            className="border-ink-300 bg-canvas-0 text-ink-900 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md text-sm"
            disabled={loading}
          />
        </label>
        <Button
          color="indigo"
          size="lg"
          className="min-w-[132px]"
          loading={loading}
          disabled={disabled}
          onClick={submitPayment}
        >
          {wallet ? `Pay ${MEXAS_TOKEN.symbol}` : 'Create wallet'}
        </Button>
      </Row>

      <Row className="text-ink-500 min-h-[20px] flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {walletAddress
            ? `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : 'No wallet created yet'}
        </span>
        <button
          className="text-primary-600 hover:text-primary-700 disabled:text-ink-300"
          disabled={!walletAddress || loading}
          onClick={refreshBalance}
        >
          {balanceUnits === null
            ? 'Load balance'
            : `${formatMexasUnits(balanceUnits)} ${MEXAS_TOKEN.symbol}`}
        </button>
      </Row>

      {!configuredTreasury && (
        <div className="text-scarlet-600 text-xs">
          Set NEXT_PUBLIC_MEXAS_TREASURY_WALLET_ADDRESS before taking payments.
        </div>
      )}
      {balanceError && (
        <div className="text-scarlet-600 text-xs">{balanceError}</div>
      )}
      {!hasValidAmount && (
        <div className="text-scarlet-600 text-xs">
          Enter a positive amount with up to {MEXAS_TOKEN.decimals} decimals.
        </div>
      )}
      {!hasEnoughBalance && (
        <div className="text-scarlet-600 text-xs">
          This wallet does not have enough MEX.
        </div>
      )}

      <div className="text-ink-600 text-xs">
        Estimated credit: {formatMoney(displayedMana)}
        {Number(amount) >= CRYPTO_BULK_THRESHOLD_DISPLAY && (
          <span className="text-amber-600">
            {' '}
            including {Math.round(CRYPTO_BULK_PURCHASE_BONUS_PCT * 100)}% bulk
            bonus
          </span>
        )}
        {Number(amount) < CRYPTO_BULK_THRESHOLD_DISPLAY && (
          <span>
            . First MEX purchase may receive an additional{' '}
            {Math.round(CRYPTO_FIRST_PURCHASE_BONUS_PCT * 100)}% after
            verification.
          </span>
        )}
      </div>

      {checkoutState.status === 'confirming' && (
        <TxStatus
          className="text-primary-600"
          txHash={checkoutState.txHash}
          label="Waiting for Arbitrum confirmation..."
        />
      )}
      {(checkoutState.status === 'credited' ||
        checkoutState.status === 'already-processed') && (
        <TxStatus
          className="text-teal-600"
          txHash={checkoutState.txHash}
          label={clsx(
            checkoutState.status === 'already-processed'
              ? 'Already credited'
              : 'Credited',
            formatMoney(checkoutState.manaAmount)
          )}
        />
      )}
      {checkoutState.status === 'error' && (
        <Col className="gap-1">
          <div className="text-scarlet-600 text-xs">
            {checkoutState.message}
          </div>
          {checkoutState.txHash && (
            <TxStatus
              className="text-ink-500"
              txHash={checkoutState.txHash}
              label="View submitted transaction"
            />
          )}
        </Col>
      )}
    </Col>
  )
}

function TxStatus(props: { txHash: Hex; label: string; className?: string }) {
  return (
    <a
      href={getArbiscanTxUrl(props.txHash)}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-medium',
        props.className
      )}
    >
      {props.label}
      <ExternalLinkIcon className="h-3.5 w-3.5" />
    </a>
  )
}
