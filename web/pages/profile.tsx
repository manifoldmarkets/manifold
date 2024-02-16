import { RefreshIcon } from '@heroicons/react/outline'
import {
  ChevronUpIcon,
  ChevronDownIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { PrivateUser, User } from 'common/user'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { Button, buttonClass } from 'web/components/buttons/button'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { api, changeUserInfo } from 'web/lib/firebase/api'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { uploadImage } from 'web/lib/firebase/storage'
import { auth, getUserAndPrivateUser, updateUser } from 'web/lib/firebase/users'
import { toast } from 'react-hot-toast'
import router from 'next/router'
import { useUser } from 'web/hooks/use-user'
import ShortToggle from 'web/components/widgets/short-toggle'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { copyToClipboard } from 'web/lib/util/copy'
import { AiOutlineCopy } from 'react-icons/ai'
import clsx from 'clsx'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

export function EditUserField(props: {
  user: User
  field: 'bio' | 'website' | 'twitterHandle' | 'discordHandle'
  label: ReactNode
}) {
  const { user, field, label } = props
  const [value, setValue] = useState(user[field] ?? '')

  async function updateField() {
    // Note: We trim whitespace before uploading to Firestore
    await updateUser(user.id, { [field]: value.trim() })
  }

  return (
    <Col>
      {label}
      {field === 'bio' ? (
        <ExpandingInput
          className="w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={updateField}
        />
      ) : (
        <Input
          type="text"
          className={'w-full sm:w-96'}
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          onBlur={updateField}
        />
      )}
    </Col>
  )
}

export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
}) {
  const { privateUser } = props.auth
  const user = useUser() ?? props.auth.user
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [apiKey, setApiKey] = useState(privateUser.apiKey || '')
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('')
  const [betWarnings, setBetWarnings] = useState(!user.optOutBetWarnings)
  const [advancedTraderMode, setAdvancedTraderMode] = useState(
    !!user.isAdvancedTrader
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { updateUsername, updateDisplayName, userInfo, updateUserState } =
    useEditableUserInfo(user)
  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo
  const updateApiKey = async (e?: React.MouseEvent) => {
    const newApiKey = await generateNewApiKey()
    setApiKey(newApiKey ?? '')
    e?.preventDefault()

    if (!privateUser.twitchInfo) return
    await api('save-twitch', { twitchInfo: { needsRelinking: true } })
  }

  const deleteAccount = async () => {
    await api('delete-account', { username: user.username })
    await auth.signOut()
  }

  const fileHandler = async (event: any) => {
    const file = event.target.files[0]

    setAvatarLoading(true)

    await uploadImage(user.username, file)
      .then(async (url) => {
        await changeUserInfo({ avatarUrl: url })
        setAvatarUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setAvatarUrl(user.avatarUrl || '')
      })
  }

  return (
    <Page trackPageView={'user profile page'}>
      <SEO title="Profile" description="User profile settings" url="/profile" />

      <Col className="bg-canvas-0 max-w-lg rounded p-6 shadow-md sm:mx-auto">
        <Row className="items-start justify-between">
          <Title>Edit Profile</Title>
        </Row>
        <Col className="gap-4">
          <Row className="items-center gap-4">
            {avatarLoading ? (
              <LoadingIndicator />
            ) : (
              <>
                <img
                  alt={`${user.username}'s avatar`}
                  src={avatarUrl}
                  width={80}
                  height={80}
                  className="bg-ink-400 flex items-center justify-center rounded-full"
                />
                <input type="file" name="file" onChange={fileHandler} />
              </>
            )}
          </Row>

          <Col>
            <label className="mb-1 block">Display name</label>
            <Row className={'items-center gap-2'}>
              <Input
                disabled={loadingName}
                type="text"
                placeholder="Display name"
                value={name}
                onChange={(e) => {
                  updateUserState({ name: e.target.value || '' })
                }}
                onBlur={updateDisplayName}
              />
            </Row>
            {loadingName && (
              <Row className={'mt-2 items-center gap-4'}>
                <LoadingIndicator />
                <span>Loading... This may take a while.</span>
              </Row>
            )}
            {errorName && (
              <span className="text-error text-sm">{errorName}</span>
            )}
          </Col>

          <Col>
            <label className="mb-1 block">Username</label>
            <Row>
              <Input
                disabled={loadingUsername}
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => {
                  updateUserState({ username: e.target.value || '' })
                }}
                onBlur={updateUsername}
              />
            </Row>
            {loadingUsername && (
              <Row className={'mt-2 items-center gap-4'}>
                <LoadingIndicator />
                <span>Loading... This may take a while.</span>
              </Row>
            )}
            {errorUsername && (
              <span className="text-error text-sm">{errorUsername}</span>
            )}
          </Col>
          {(
            [
              ['bio', 'Bio'],
              ['website', 'Website URL'],
              ['twitterHandle', 'Twitter'],
              ['discordHandle', 'Discord'],
            ] as const
          ).map(([field, label]) => (
            <EditUserField
              key={field}
              user={user}
              field={field}
              label={<label className="mb-1 block">{label}</label>}
            />
          ))}
          <div className={'mt-2'}>
            <label className="mb-1 block">Email</label>
            <div className="text-ink-500">{privateUser.email ?? '\u00a0'}</div>
          </div>

          <Link
            href={`/${user.username}`}
            className={buttonClass('lg', 'green')}
          >
            Done
          </Link>

          <Button
            color={'gray-white'}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced
            {showAdvanced ? (
              <ChevronUpIcon className="ml-1 h-5 w-5" />
            ) : (
              <ChevronDownIcon className="ml-1 h-5 w-5" />
            )}
          </Button>
          <Col className={clsx('gap-2', showAdvanced ? '' : 'hidden')}>
            <div>
              <label className="mb-1 block">
                Advanced trader mode{' '}
                <InfoTooltip text={'More advanced betting UI'} />
              </label>
              <ShortToggle
                on={advancedTraderMode}
                setOn={(enabled) => {
                  setAdvancedTraderMode(enabled)
                  updateUser(user.id, { isAdvancedTrader: enabled })
                }}
              />
            </div>
            <div>
              <label className="mb-1 block">
                Bet warnings{' '}
                <InfoTooltip
                  text={
                    'Warnings before you place a bet that is either 1. a large portion of your balance, or 2. going to move the probability by a large amount'
                  }
                />
              </label>
              <ShortToggle
                on={betWarnings}
                setOn={(enabled) => {
                  setBetWarnings(enabled)
                  updateUser(user.id, { optOutBetWarnings: !enabled })
                }}
              />
            </div>

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
                      connected to your account, <b>including the Twitch bot</b>
                      . You will need to go to the{' '}
                      <Link
                        href="/twitch"
                        className="underline focus:outline-none"
                      >
                        Twitch page
                      </Link>{' '}
                      to relink your account.
                    </div>
                  </Col>
                </ConfirmationButton>
              </Row>
            </div>
            <div>
              <label className="mb-1 block">Delete Account</label>
              <div className="flex w-full items-stretch space-x-1">
                <ConfirmationButton
                  openModalBtn={{
                    className: 'p-2',
                    label: 'Permanently delete this account',
                    icon: <TrashIcon className="mr-1 h-5 w-5" />,
                    color: 'red',
                  }}
                  submitBtn={{
                    label: 'Delete account',
                    color:
                      deleteAccountConfirmation == 'delete my account'
                        ? 'red'
                        : 'gray',
                  }}
                  onSubmitWithSuccess={async () => {
                    if (deleteAccountConfirmation == 'delete my account') {
                      toast
                        .promise(deleteAccount(), {
                          loading: 'Deleting account...',
                          success: () => {
                            router.push('/')
                            return 'Account deleted'
                          },
                          error: () => {
                            return 'Failed to delete account'
                          },
                        })
                        .then(() => {
                          return true
                        })
                        .catch(() => {
                          return false
                        })
                    }
                    return false
                  }}
                >
                  <Col>
                    <Title>Are you sure?</Title>
                    <div>
                      Deleting your account means you will no longer be able to
                      use your account. You will lose access to all of your
                      data.
                    </div>
                    <Input
                      type="text"
                      placeholder="Type 'delete my account' to confirm"
                      className="w-full"
                      value={deleteAccountConfirmation}
                      onChange={(e) =>
                        setDeleteAccountConfirmation(e.target.value)
                      }
                    />
                  </Col>
                </ConfirmationButton>
              </div>
            </div>
          </Col>
        </Col>
      </Col>
    </Page>
  )
}
