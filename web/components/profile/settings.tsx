import { RefreshIcon } from '@heroicons/react/solid'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AiOutlineCopy } from 'react-icons/ai'
import { copyToClipboard } from 'web/lib/util/copy'
import { Button } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Input } from '../widgets/input'
import ShortToggle from '../widgets/short-toggle'
import { Title } from '../widgets/title'
import { canReceiveBonuses, PrivateUser, User } from 'common/user'
import { useEffect, useState } from 'react'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { DeleteYourselfButton } from './delete-yourself'
import { capitalize } from 'lodash'
import { ENV_CONFIG, isAdminId, TRADE_TERM } from 'common/envs/constants'
import { useNativeInfo } from '../native-message-provider'
import { postMessageToNative } from 'web/lib/native/post-message'
import { useRouter } from 'next/router'

export const AccountSettings = (props: {
  user: User
  privateUser: PrivateUser
}) => {
  const { user, privateUser } = props

  const [apiKey, setApiKey] = useState(privateUser.apiKey || '')
  const [betWarnings, setBetWarnings] = useState(!user.optOutBetWarnings)
  const [appUrl, setAppUrl] = useState('https://' + ENV_CONFIG.domain)
  const isAdmin = isAdminId(user.id)
  const { isNative } = useNativeInfo()

  const sendAppUrl = async () => {
    postMessageToNative('setAppUrl', { appUrl })
    return
  }
  const updateApiKey = async (e?: React.MouseEvent) => {
    const newApiKey = await generateNewApiKey()
    setApiKey(newApiKey ?? '')
    e?.preventDefault()

    if (!privateUser.twitchInfo) return
    await api('save-twitch', { twitchInfo: { needsRelinking: true } })
  }

  return (
    <Col className="gap-5">
      {!canReceiveBonuses(user) && <IdentityVerificationSetting />}
      <div>
        <label className="mb-1 block">
          {capitalize(TRADE_TERM)} warnings{' '}
          <InfoTooltip
            text={`Warnings before you place a ${TRADE_TERM} that is either 1. a large portion of your balance, or 2. going to move the probability by a large amount`}
          />
        </label>
        <ShortToggle
          on={betWarnings}
          setOn={(enabled) => {
            setBetWarnings(enabled)
            api('me/update', { optOutBetWarnings: !enabled })
          }}
        />
      </div>

      <div>
        <label className="mb-1 block">Notifications & Emails </label>
        <Link href="/notifications?tab=settings">
          <Button>Edit settings</Button>
        </Link>
      </div>
      {isAdmin && isNative && (
        <div>
          Native url
          <Input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} />
          <Button onClick={sendAppUrl}>Send</Button>
        </div>
      )}
      <div>
        <label className="mb-1 block">API key</label>
        <Row className="items-stretch gap-3">
          <Input
            type="text"
            placeholder="Click refresh to generate key"
            value={apiKey}
            readOnly
            className={'w-24'}
          />

          <Button
            color={'indigo'}
            onClick={() => {
              copyToClipboard(apiKey)
              toast.success('Copied to clipboard')
            }}
          >
            <AiOutlineCopy className="h-5 w-5" />
          </Button>
          <ConfirmationButton
            openModalBtn={{
              className: 'p-2',
              label: '',
              icon: <RefreshIcon className="h-5 w-5" />,
              color: 'red',
            }}
            submitBtn={{
              label: 'Update key',
            }}
            onSubmitWithSuccess={async () => {
              updateApiKey()
              return true
            }}
          >
            <Col>
              <Title>Are you sure?</Title>
              <div>
                Updating your API key will break any existing applications
                connected to your account, <b>including the Twitch bot</b>. You
                will need to go to the{' '}
                <Link href="/twitch" className="underline focus:outline-none">
                  Twitch page
                </Link>{' '}
                to relink your account.
              </div>
            </Col>
          </ConfirmationButton>
        </Row>
      </div>
      {!user.isBot && (
        <div>
          <label className="mb-1 block">Bot status</label>
          <MarkSelfAsBotButton user={user} />
        </div>
      )}
      <div>
        <label className="mb-1 block">Delete Account </label>
        <div className="flex  items-center  ">
          <DeleteYourselfButton username={user.username} />
        </div>
      </div>
    </Col>
  )
}

function IdentityVerificationSetting() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      track('identity verification: started from settings')
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError('Failed to start verification. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <label className="mb-1 block">Identity Verification</label>
      <div className="text-ink-600 mb-2 text-sm">
        Verify your identity to be eligible for bonuses and cash prize raffles.
      </div>
      {error && <div className="text-scarlet-500 mb-2 text-sm">{error}</div>}
      <Button onClick={handleVerify} loading={loading} disabled={loading}>
        Verify Identity
      </Button>
    </div>
  )
}

function MarkSelfAsBotButton(props: { user: User }) {
  const { user } = props
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!showModal) {
      setCountdown(10)
      return
    }
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [showModal, countdown])

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await api('set-bot-status', { userId: user.id, isBot: true })
      toast.success('Account marked as bot')
      router.reload()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update bot status')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button color="yellow" size="xs" onClick={() => setShowModal(true)}>
        Mark my account as a bot
      </Button>
      <Modal open={showModal} setOpen={setShowModal} size="md">
        <Col className="bg-canvas-0 rounded-xl p-6 gap-4">
          <Title className="!mb-0">Mark account as bot</Title>
          <div className="text-ink-700 text-sm leading-relaxed space-y-3">
            <p>
              This will <b>permanently</b> mark your account as a bot. This
              action <b>cannot be undone</b> without contacting a moderator.
            </p>
            <p className="font-semibold">Bot accounts:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Display a "Bot" badge next to your name</li>
              <li>Are excluded from leagues and placed in the Silicon division</li>
              <li>Do not count toward unique bettor bonuses for market creators</li>
              <li>Are excluded from importance score calculations</li>
              <li>Cannot earn bettor bonuses for other users</li>
            </ul>
            <p>
              Only do this if your account is operated by an automated system
              (trading bot, API script, etc.), not a human.
            </p>
          </div>
          <Row className="mt-2 justify-end gap-3">
            <Button color="gray" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={countdown > 0 || submitting}
              loading={submitting}
              onClick={handleConfirm}
            >
              {countdown > 0
                ? `I understand (${countdown}s)`
                : 'Mark as bot permanently'}
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
