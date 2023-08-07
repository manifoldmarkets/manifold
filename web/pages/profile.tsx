import { RefreshIcon } from '@heroicons/react/outline'
import { TrashIcon } from '@heroicons/react/solid'
import { PrivateUser, User } from 'common/user'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import Link from 'next/link'
import { useState } from 'react'
import { buttonClass } from 'web/components/buttons/button'
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
import { changeUserInfo } from 'web/lib/firebase/api'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { uploadImage } from 'web/lib/firebase/storage'
import {
  auth,
  getUserAndPrivateUser,
  updatePrivateUser,
  updateUser,
} from 'web/lib/firebase/users'
import { deleteField } from 'firebase/firestore'
import { toast } from 'react-hot-toast'
import router from 'next/router'
import { useUser } from 'web/hooks/use-user'
import ShortToggle from 'web/components/widgets/short-toggle'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

function EditUserField(props: {
  user: User
  field: 'bio' | 'website' | 'twitterHandle' | 'discordHandle'
  label: string
}) {
  const { user, field, label } = props
  const [value, setValue] = useState(user[field] ?? '')

  async function updateField() {
    // Note: We trim whitespace before uploading to Firestore
    await updateUser(user.id, { [field]: value.trim() })
  }

  return (
    <div>
      <label className="mb-1 block">{label}</label>

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
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          onBlur={updateField}
        />
      )}
    </div>
  )
}

export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
}) {
  const { privateUser } = props.auth
  const user = useUser() ?? props.auth.user
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [name, setName] = useState(user.name)
  const [username, setUsername] = useState(user.username)
  const [apiKey, setApiKey] = useState(privateUser.apiKey || '')
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('')
  const [loadingName, setLoadingName] = useState(false)
  const [loadingUsername, setLoadingUsername] = useState(false)
  const [errorName, setErrorName] = useState('')
  const [errorUsername, setErrorUsername] = useState('')
  const [betWarnings, setBetWarnings] = useState(!user.optOutBetWarnings)
  const updateDisplayName = async () => {
    const newName = cleanDisplayName(name)
    if (newName === user.name) return
    setLoadingName(true)
    setErrorName('')
    if (!newName) return setName(user.name)

    setName(newName)
    await changeUserInfo({ name: newName })
      .then(() => {
        setErrorName('')
        setName(newName)
      })
      .catch((reason) => {
        setErrorName(reason.message)
        setName(user.name)
      })
    setLoadingName(false)
  }

  const updateUsername = async () => {
    const newUsername = cleanUsername(username)
    if (newUsername === user.username) return

    if (!newUsername) return setUsername(user.username)
    setLoadingUsername(true)
    setErrorUsername('')
    setUsername(newUsername)
    await changeUserInfo({ username: newUsername })
      .then(() => {
        setErrorUsername('')
        setUsername(newUsername)
      })
      .catch((reason) => {
        setErrorUsername(reason.message)
        setUsername(user.username)
      })
    setLoadingUsername(false)
  }

  const updateApiKey = async (e?: React.MouseEvent) => {
    const newApiKey = await generateNewApiKey(user.id)
    setApiKey(newApiKey ?? '')
    e?.preventDefault()

    if (!privateUser.twitchInfo) return
    await updatePrivateUser(privateUser.id, {
      twitchInfo: { ...privateUser.twitchInfo, needsRelinking: true },
    })
  }

  const deleteAccount = async () => {
    await updateUser(user.id, { userDeleted: true })
    await updatePrivateUser(privateUser.id, {
      //eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      email: deleteField(),
      //eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      twitchInfo: deleteField(),
      notificationPreferences: {
        ...privateUser.notificationPreferences,
        opt_out_all: ['email', 'mobile', 'browser'],
      },
    })
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
    <Page>
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
                  setName(e.target.value || '')
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
              <span className="text-sm text-red-500">{errorName}</span>
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
                  setUsername(e.target.value || '')
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
              <span className="text-sm text-red-500">{errorUsername}</span>
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
              label={label}
            />
          ))}

          <Link
            href={`/${user.username}`}
            className={buttonClass('lg', 'green')}
          >
            Done
          </Link>

          <div className={'mt-8'}>
            <label className="mb-1 block">Email</label>
            <div className="text-ink-500">{privateUser.email ?? '\u00a0'}</div>
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
            <div className="flex w-full items-stretch space-x-1">
              <Input
                type="text"
                placeholder="Click refresh to generate key"
                value={apiKey}
                readOnly
              />
              <ConfirmationButton
                openModalBtn={{
                  className: 'p-2',
                  label: '',
                  icon: <RefreshIcon className="h-5 w-5" />,
                  color: 'indigo',
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
                  <Title children={'Are you sure?'} />
                  <div>
                    Updating your API key will break any existing applications
                    connected to your account, <b>including the Twitch bot</b>.
                    You will need to go to the{' '}
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
            </div>
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
                  <Title children={'Are you sure?'} />
                  <div>
                    Deleting your account means you will no longer be able to
                    use your account. You will lose access to all of your data.
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
    </Page>
  )
}
