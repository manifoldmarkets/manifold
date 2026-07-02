import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { FullUser } from 'common/api/user-types'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import { Avatar } from 'web/components/widgets/avatar'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'
import {
  DisplayUser,
  searchUsers,
  getFullUserById,
} from 'web/lib/supabase/users'
import { UserBan } from 'common/user'
import { getActiveBlockingBans } from 'common/ban-utils'
import { ConfirmActionModal } from 'web/components/admin/ConfirmActionModal'
import { useRouter } from 'next/router'

export default function AdminUserInfoPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<
    Array<DisplayUser & { matchedEmail?: string; matchedOnOldEmail?: boolean }>
  >([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<FullUser | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userInfo, setUserInfo] = useState<{
    supabaseEmail?: string
    oldEmail?: string
    firebaseEmail?: string
    initialDeviceToken?: string
    initialIpAddress?: string
    verificationFlagReason?: string
  } | null>(null)
  const [manualEmail, setManualEmail] = useState('')
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false)
  const [relatedUsers, setRelatedUsers] = useState<
    Array<{
      visibleUser: FullUser
      matchReasons: (
        | 'ip'
        | 'deviceToken'
        | 'referrer'
        | 'referee'
        | 'managram'
      )[]
      netManagramAmount?: number
      bans: UserBan[]
    }>
  >([])
  const [targetCreatedTime, setTargetCreatedTime] = useState<
    number | undefined
  >()
  const [isLoadingRelatedUsers, setIsLoadingRelatedUsers] = useState(false)
  const [showAllRelated, setShowAllRelated] = useState(false)

  // Confirmation modal states
  const [showRecoverModal, setShowRecoverModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAnonymizeModal, setShowAnonymizeModal] = useState(false)

  const requestId = useRef(0)

  // Load user from URL parameter if provided
  useEffect(() => {
    const userId = router.query.userId as string | undefined
    if (userId && isAdmin) {
      getFullUserById(userId).then((user) => {
        if (user) {
          setSelectedUser(user)
        } else {
          toast.error('User not found')
        }
      })
    }
  }, [router.query.userId, isAdmin])

  // Search for users - use email search if query looks like an email
  useEffect(() => {
    const id = ++requestId.current
    if (query.length > 1) {
      const isEmailQuery = query.includes('@')
      setIsSearching(true)

      if (isEmailQuery) {
        api('admin-search-users-by-email', { email: query, limit: 10 })
          .then((results) => {
            if (id === requestId.current) {
              setSearchResults(
                results.map((r) => ({
                  ...r.user,
                  matchedEmail: r.matchedEmail,
                  matchedOnOldEmail: r.matchedOnOldEmail,
                }))
              )
            }
          })
          .finally(() => {
            if (id === requestId.current) setIsSearching(false)
          })
      } else {
        searchUsers(query, 10)
          .then((results) => {
            if (id === requestId.current) {
              setSearchResults(results)
            }
          })
          .finally(() => {
            if (id === requestId.current) setIsSearching(false)
          })
      }
    } else {
      setSearchResults([])
      setIsSearching(false)
    }
  }, [query])

  // Fetch user info when user is selected
  useEffect(() => {
    if (selectedUser) {
      setIsLoadingUserInfo(true)
      api('get-user-info', { userId: selectedUser.id })
        .then((info) => {
          setUserInfo(info)
        })
        .catch((error) => {
          console.error('Error fetching user info:', error)
          toast.error('Failed to fetch user info')
        })
        .finally(() => {
          setIsLoadingUserInfo(false)
        })

      // Fetch related users (potential alts)
      setIsLoadingRelatedUsers(true)
      api('admin-get-related-users', { userId: selectedUser.id })
        .then((result) => {
          setRelatedUsers(result.matches)
          setTargetCreatedTime(result.targetCreatedTime)
        })
        .catch((error) => {
          console.error('Error fetching related users:', error)
        })
        .finally(() => {
          setIsLoadingRelatedUsers(false)
        })
    } else {
      setUserInfo(null)
      setManualEmail('')
      setRelatedUsers([])
      setTargetCreatedTime(undefined)
      setShowAllRelated(false)
    }
  }, [selectedUser])

  // verificationFlagReason is stripped from the public User response, so
  // re-hydrate it onto selectedUser from the admin-gated get-user-info result.
  // Keyed on userInfo (not selectedUser) + value-guarded so it doesn't loop.
  useEffect(() => {
    if (!userInfo || !selectedUser) return
    const reason = userInfo.verificationFlagReason
    if (
      (selectedUser.verificationFlagReason ?? undefined) !==
      (reason ?? undefined)
    ) {
      setSelectedUser({ ...selectedUser, verificationFlagReason: reason })
    }
  }, [userInfo])

  const selectUser = (user: DisplayUser) => {
    setSelectedUser(user as FullUser)
    setQuery('')
    setSearchResults([])
  }

  const handleRecover = () => {
    if (!selectedUser) return

    // Check if we have an email to restore
    const hasOldEmail = userInfo?.oldEmail
    const hasManualEmail = manualEmail.trim().length > 0

    if (!hasOldEmail && !hasManualEmail) {
      toast.error(
        'No email available to restore. Please enter an email address manually.'
      )
      return
    }

    setShowRecoverModal(true)
  }

  const confirmRecover = async () => {
    if (!selectedUser) return

    setShowRecoverModal(false)
    setIsSubmitting(true)

    try {
      const hasManualEmail = manualEmail.trim().length > 0
      await api('recover-user', {
        userId: selectedUser.id,
        email: hasManualEmail ? manualEmail : undefined,
      })
      toast.success(`Account recovered successfully for ${selectedUser.name}!`)

      // Refresh the user data
      setSelectedUser(null)
      setQuery('')
    } catch (error) {
      console.error('Error recovering user:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to recover user account'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = () => {
    if (!selectedUser) return
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!selectedUser) return

    setShowDeleteModal(false)
    setIsSubmitting(true)

    try {
      await api('admin-delete-user', {
        userId: selectedUser.id,
      })
      toast.success(`Account deleted successfully for ${selectedUser.name}.`)

      // Refresh the user data
      setSelectedUser(null)
      setQuery('')
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete user account'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAnonymize = () => {
    if (!selectedUser) return
    setShowAnonymizeModal(true)
  }

  const confirmAnonymize = async () => {
    if (!selectedUser) return

    setShowAnonymizeModal(false)
    setIsSubmitting(true)

    try {
      const result = await api('anonymize-user', {
        userId: selectedUser.id,
      })
      toast.success(
        `User anonymized. New username: ${result.newUsername}, New name: ${result.newName}`
      )

      // Refresh the user data
      setSelectedUser(null)
      setQuery('')
    } catch (error) {
      console.error('Error anonymizing user:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to anonymize user'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={'admin user info page'}>
      <NoSEO />
      <div className="mx-8">
        <Title>Admin - User Info & Account Management</Title>

        <Col className="gap-6">
          {/* Info Section */}
          <div className="border-ink-200 rounded-lg border bg-blue-50 p-4">
            <h3 className="mb-2 font-semibold text-blue-900">
              Account Management Information
            </h3>
            <p className="text-sm text-blue-800">
              This tool allows you to delete or recover user accounts.
            </p>
            <div className="mt-3">
              <p className="mb-1 text-sm font-semibold text-blue-900">
                When you delete an account:
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
                <li>
                  Set <code>userDeleted</code> to <code>true</code>
                </li>
                <li>
                  Set <code>isBannedFromPosting</code> to <code>true</code>
                </li>
                <li>
                  Save email to <code>old_e_mail</code> for recovery
                </li>
                <li>Delete email and Twitch info</li>
              </ul>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-sm font-semibold text-blue-900">
                When you recover an account:
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
                <li>
                  Set <code>userDeleted</code> to <code>false</code>
                </li>
                <li>
                  Set <code>isBannedFromPosting</code> to <code>false</code>
                </li>
                <li>
                  Restore email (from <code>old_e_mail</code> or manual input)
                </li>
              </ul>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-sm font-semibold text-amber-900">
                When you anonymize a user:
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-amber-800">
                <li>Randomize username and name (cannot be undone)</li>
                <li>Delete avatar, bio, website</li>
                <li>Delete Twitter, Discord handles</li>
                <li>Delete Twitch info</li>
                <li>
                  Email/old_e_mail preserved (for recovery or manual deletion)
                </li>
              </ul>
            </div>
          </div>

          {/* User Search Section */}
          <div>
            <h2 className="mb-4 text-lg font-semibold">Search for User</h2>
            <p className="text-ink-600 mb-4 text-sm">
              Search by username, name, user ID, or email address. Deleted
              accounts will still appear in search results.
            </p>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, username, ID, or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full max-w-md"
              />

              {isSearching && query.includes('@') && (
                <div className="text-ink-600 mt-2 text-sm">
                  Searching by email...
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="bg-canvas-0 border-ink-200 absolute top-full z-10 mt-1 max-h-64 w-full max-w-md overflow-auto rounded-md border shadow-lg">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      className="hover:bg-canvas-50 flex w-full items-center gap-3 p-3 text-left"
                      onClick={() => selectUser(user)}
                    >
                      <Avatar
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {user.name}
                          {(user as any).userDeleted && (
                            <span className="ml-2 text-xs text-red-600">
                              [DELETED]
                            </span>
                          )}
                          {(user as any).isBannedFromPosting && (
                            <span
                              className="ml-2 text-xs text-orange-600"
                              title={
                                (user as any).banReason ?? 'No reason provided'
                              }
                            >
                              [BANNED]
                            </span>
                          )}
                        </div>
                        <div className="text-ink-600 text-sm">
                          @{user.username}
                        </div>
                        {user.matchedEmail && (
                          <div className="text-ink-500 truncate text-xs">
                            {user.matchedOnOldEmail ? 'old_email: ' : 'email: '}
                            {user.matchedEmail}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected User Info */}
          {selectedUser && (
            <div className="border-ink-200 rounded-lg border p-6">
              <h2 className="mb-4 text-lg font-semibold">Selected User</h2>
              <Row className="mb-4 items-center gap-4">
                <Avatar
                  username={selectedUser.username}
                  avatarUrl={selectedUser.avatarUrl}
                  size="lg"
                />
                <div>
                  <div className="font-medium">{selectedUser.name}</div>
                  <div className="text-ink-600">@{selectedUser.username}</div>
                  <div className="text-ink-500 text-sm">
                    ID: {selectedUser.id}
                  </div>
                </div>
              </Row>

              {/* User Info */}
              <div className="border-ink-200 mb-4 space-y-2 rounded border p-4">
                <h3 className="font-semibold">User Information</h3>
                {isLoadingUserInfo ? (
                  <div className="text-ink-600 text-sm">
                    Loading user info...
                  </div>
                ) : userInfo ? (
                  <div className="space-y-2">
                    <div>
                      <span className="text-ink-600 text-sm">
                        Initial Device Token:{' '}
                      </span>
                      <span className="font-mono text-sm">
                        {userInfo.initialDeviceToken || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-600 text-sm">
                        Initial IP Address:{' '}
                      </span>
                      <span className="font-mono text-sm">
                        {userInfo.initialIpAddress || 'None'}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Account Status */}
              <div className="border-ink-200 mb-4 space-y-2 rounded border p-4">
                <h3 className="font-semibold">Account Status</h3>
                <Row className="gap-4">
                  <div>
                    <span className="text-ink-600 text-sm">Deleted: </span>
                    <span
                      className={`font-medium ${
                        selectedUser.userDeleted
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {selectedUser.userDeleted ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-600 text-sm">
                      Banned from posting:{' '}
                    </span>
                    <span
                      className={`font-medium ${
                        selectedUser.isBannedFromPosting
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {selectedUser.isBannedFromPosting ? 'Yes' : 'No'}
                    </span>
                  </div>
                </Row>
              </div>

              {/* Bonus Eligibility */}
              <BonusEligibilitySection
                user={selectedUser}
                onUpdate={(newUser) => setSelectedUser(newUser)}
              />

              {/* Flag for Verification (suspected alt / suspicious signup) */}
              <FlagForVerificationSection
                user={selectedUser}
                onUpdate={(newUser) => setSelectedUser(newUser)}
              />

              {/* Prize Eligibility */}
              <PrizeEligibilitySection
                user={selectedUser}
                onUpdate={(newUser) => setSelectedUser(newUser)}
              />

              {/* Email Status */}
              <div className="border-ink-200 mb-4 space-y-3 rounded border p-4">
                <h3 className="font-semibold">Email Status</h3>
                {isLoadingUserInfo ? (
                  <div className="text-ink-600 text-sm">
                    Loading email status...
                  </div>
                ) : userInfo ? (
                  <div className="space-y-2">
                    <div>
                      <span className="text-ink-600 text-sm">
                        Current Supabase Email:{' '}
                      </span>
                      <span
                        className={`font-mono text-sm ${
                          userInfo.supabaseEmail
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {userInfo.supabaseEmail || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-600 text-sm">
                        Saved old_e_mail:{' '}
                      </span>
                      <span
                        className={`font-mono text-sm ${
                          userInfo.oldEmail
                            ? 'text-green-600'
                            : 'text-orange-600'
                        }`}
                      >
                        {userInfo.oldEmail || 'None (manual input required)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-600 text-sm">
                        Firebase Auth Email:{' '}
                      </span>
                      <span className="font-mono text-sm text-blue-600">
                        {userInfo.firebaseEmail || 'Not available'}
                      </span>
                      {userInfo.firebaseEmail && (
                        <button
                          onClick={() =>
                            setManualEmail(userInfo.firebaseEmail || '')
                          }
                          className="text-primary-600 ml-2 text-xs underline"
                        >
                          Use this
                        </button>
                      )}
                    </div>

                    {!userInfo.oldEmail && (
                      <div className="mt-3 rounded border border-orange-200 bg-orange-50 p-3">
                        <p className="text-sm text-orange-800">
                          <strong>⚠️ No old_e_mail found.</strong> You must
                          manually enter an email address below. Use the
                          Firebase Auth email shown above or verify the correct
                          email in the Firebase console.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Related Accounts (Potential Alts) */}
              <div className="border-ink-200 mb-4 space-y-3 rounded border p-4">
                <h3 className="font-semibold">
                  Related Accounts (Potential Alts)
                </h3>
                {isLoadingRelatedUsers ? (
                  <div className="text-ink-600 text-sm">
                    Searching for related accounts...
                  </div>
                ) : relatedUsers.length === 0 ? (
                  <div className="text-ink-500 text-sm">
                    No related accounts found (no matching IP or device token).
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2">
                      <p className="text-sm text-amber-800">
                        {formatRelatedAccountsSummary(relatedUsers)}
                      </p>
                    </div>
                    {(showAllRelated
                      ? relatedUsers
                      : relatedUsers.slice(0, 3)
                    ).map(
                      ({
                        visibleUser,
                        matchReasons,
                        netManagramAmount,
                        bans,
                      }) => {
                        const activeBanTypes = getActiveBlockingBans(bans)
                        const hasActiveBan = activeBanTypes.length > 0
                        const hasHistoricalBan =
                          bans.length > 0 && !hasActiveBan
                        const timeDiff =
                          targetCreatedTime && visibleUser.createdTime
                            ? Math.abs(
                                targetCreatedTime - visibleUser.createdTime
                              )
                            : null
                        const formatTimeDiff = (ms: number) => {
                          const minutes = Math.floor(ms / (1000 * 60))
                          const hours = Math.floor(ms / (1000 * 60 * 60))
                          const days = Math.floor(ms / (1000 * 60 * 60 * 24))
                          if (minutes < 1) return 'same minute'
                          if (minutes < 60) return `${minutes} min apart`
                          if (hours < 24) return `${hours} hr apart`
                          if (days < 30)
                            return `${days} day${days !== 1 ? 's' : ''} apart`
                          return `${Math.floor(days / 30)} month${
                            Math.floor(days / 30) !== 1 ? 's' : ''
                          } apart`
                        }
                        return (
                          <div
                            key={visibleUser.id}
                            className="bg-canvas-50 flex items-center justify-between rounded border p-3"
                          >
                            <button
                              className="flex items-center gap-3 text-left hover:underline"
                              onClick={() => selectUser(visibleUser)}
                            >
                              <Avatar
                                username={visibleUser.username}
                                avatarUrl={visibleUser.avatarUrl}
                                size="sm"
                              />
                              <div>
                                <div className="font-medium">
                                  {visibleUser.name}
                                  {visibleUser.userDeleted && (
                                    <span className="ml-2 text-xs text-red-600">
                                      [DELETED]
                                    </span>
                                  )}
                                  {hasActiveBan && (
                                    <span
                                      className="ml-2 text-xs text-red-600"
                                      title={`Active bans: ${activeBanTypes.join(
                                        ', '
                                      )}`}
                                    >
                                      [BAN]
                                    </span>
                                  )}
                                  {hasHistoricalBan && (
                                    <span
                                      className="ml-2 text-xs text-orange-500"
                                      title={`${bans.length} historical ban${
                                        bans.length > 1 ? 's' : ''
                                      }`}
                                    >
                                      [HIST]
                                    </span>
                                  )}
                                </div>
                                <div className="text-ink-600 text-sm">
                                  @{visibleUser.username}
                                </div>
                              </div>
                            </button>
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex flex-wrap justify-end gap-1">
                                {matchReasons.includes('referrer') && (
                                  <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                                    Referrer
                                  </span>
                                )}
                                {matchReasons.includes('referee') && (
                                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                    Referee
                                  </span>
                                )}
                                {matchReasons.includes('ip') && (
                                  <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                                    Same IP
                                  </span>
                                )}
                                {matchReasons.includes('deviceToken') && (
                                  <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                                    Same Device
                                  </span>
                                )}
                                {matchReasons.includes('managram') &&
                                  netManagramAmount !== undefined && (
                                    <span
                                      className={`rounded px-2 py-1 text-xs font-medium ${
                                        netManagramAmount > 0
                                          ? 'bg-green-100 text-green-800'
                                          : netManagramAmount < 0
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {netManagramAmount > 0 ? '+' : ''}
                                      {Math.round(
                                        netManagramAmount
                                      ).toLocaleString()}
                                    </span>
                                  )}
                              </div>
                              {timeDiff !== null && (
                                <span className="text-ink-500 text-xs">
                                  {formatTimeDiff(timeDiff)}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      }
                    )}
                    {relatedUsers.length > 3 && (
                      <button
                        onClick={() => setShowAllRelated(!showAllRelated)}
                        className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm"
                      >
                        {showAllRelated ? (
                          <>
                            <ChevronUpIcon className="h-4 w-4" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDownIcon className="h-4 w-4" />
                            Show all {relatedUsers.length} accounts
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Email Input */}
              {(!userInfo?.oldEmail || manualEmail) && (
                <div className="mb-4">
                  <label className="text-ink-700 mb-2 block text-sm font-medium">
                    Manual Email Override{' '}
                    {!userInfo?.oldEmail && (
                      <span className="text-red-600">*</span>
                    )}
                  </label>
                  <Input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full max-w-md"
                  />
                  <p className="text-ink-500 mt-1 text-xs">
                    {userInfo?.oldEmail
                      ? 'Leave empty to use old_e_mail, or enter a different email to override.'
                      : 'Required: Enter the email address to restore for this account.'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <Row className="gap-3">
                  <Button
                    onClick={handleRecover}
                    disabled={
                      isSubmitting ||
                      isLoadingUserInfo ||
                      (!selectedUser.userDeleted &&
                        !selectedUser.isBannedFromPosting)
                    }
                    loading={isSubmitting}
                    color="green"
                  >
                    Recover Account
                  </Button>

                  <Button
                    onClick={handleDelete}
                    disabled={
                      isSubmitting ||
                      isLoadingUserInfo ||
                      selectedUser.userDeleted
                    }
                    loading={isSubmitting}
                    color="red"
                  >
                    Delete Account
                  </Button>

                  <Button
                    onClick={handleAnonymize}
                    disabled={isSubmitting || isLoadingUserInfo}
                    loading={isSubmitting}
                    color="amber"
                  >
                    Anonymize User
                  </Button>
                </Row>

                <Row className="gap-3">
                  <Button
                    type="button"
                    color="gray"
                    onClick={() => setSelectedUser(null)}
                  >
                    Cancel
                  </Button>
                </Row>

                {/* Button Status Explanations */}
                <div className="text-ink-600 space-y-1 text-xs">
                  {!selectedUser.userDeleted &&
                    !selectedUser.isBannedFromPosting && (
                      <p className="text-gray-500">
                        • Recover is disabled (account is not deleted)
                      </p>
                    )}
                  {selectedUser.userDeleted && (
                    <p className="text-gray-500">
                      • Delete is disabled (account is already deleted)
                    </p>
                  )}
                  <p>
                    • Anonymize can be used on any account to remove identifying
                    information
                  </p>
                </div>
              </div>
            </div>
          )}
        </Col>
      </div>

      {/* Confirmation Modals */}
      {selectedUser && (
        <>
          <ConfirmActionModal
            isOpen={showRecoverModal}
            onClose={() => setShowRecoverModal(false)}
            onConfirm={confirmRecover}
            title="Recover User Account"
            description={
              <>
                Are you sure you want to recover the account for{' '}
                <strong>
                  {selectedUser.name} (@{selectedUser.username})
                </strong>
                ?
                <br />
                <br />
                This will:
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    Set <code>userDeleted</code> to <code>false</code>
                  </li>
                  <li>
                    Set <code>isBannedFromPosting</code> to <code>false</code>
                  </li>
                  <li>
                    Restore email to:{' '}
                    {manualEmail.trim()
                      ? manualEmail
                      : userInfo?.oldEmail || 'unknown'}
                  </li>
                </ul>
              </>
            }
            confirmationWord="recover account"
            confirmButtonText="Recover Account"
            confirmButtonColor="green"
            isSubmitting={isSubmitting}
          />

          <ConfirmActionModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={confirmDelete}
            title="Delete User Account"
            description={
              <>
                <strong>⚠️ WARNING:</strong> Are you sure you want to DELETE the
                account for{' '}
                <strong>
                  {selectedUser.name} (@{selectedUser.username})
                </strong>
                ?
                <br />
                <br />
                This will:
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    Set <code>userDeleted</code> to <code>true</code>
                  </li>
                  <li>
                    Set <code>isBannedFromPosting</code> to <code>true</code>
                  </li>
                  <li>
                    Save current email to <code>old_e_mail</code>
                  </li>
                  <li>Delete their email and Twitch info</li>
                </ul>
              </>
            }
            confirmationWord="delete account"
            confirmButtonText="Delete Account"
            confirmButtonColor="red"
            isSubmitting={isSubmitting}
          />

          <ConfirmActionModal
            isOpen={showAnonymizeModal}
            onClose={() => setShowAnonymizeModal(false)}
            onConfirm={confirmAnonymize}
            title="Anonymize User"
            description={
              <>
                <strong>⚠️ WARNING:</strong> Are you sure you want to ANONYMIZE{' '}
                <strong>
                  {selectedUser.name} (@{selectedUser.username})
                </strong>
                ?
                <br />
                <br />
                This will <strong>permanently</strong>:
                <ul className="list-inside list-disc space-y-1">
                  <li>Randomize username and name (cannot be undone)</li>
                  <li>Delete avatar, bio, website</li>
                  <li>Delete Twitter, Discord handles</li>
                  <li>Delete Twitch info</li>
                  <li>Preserve email/old_e_mail for potential recovery</li>
                </ul>
              </>
            }
            confirmationWord="anonymize"
            confirmButtonText="Anonymize User"
            confirmButtonColor="amber"
            isSubmitting={isSubmitting}
          />
        </>
      )}
    </Page>
  )
}

type MatchReason = 'ip' | 'deviceToken' | 'referrer' | 'referee' | 'managram'

const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  ip: 'matching IP',
  deviceToken: 'matching device token',
  referrer: 'matching referrer',
  referee: 'matching referee',
  managram: 'matching managram history',
}

function formatRelatedAccountsSummary(
  relatedUsers: Array<{ matchReasons: MatchReason[] }>
) {
  const counts: Record<MatchReason, number> = {
    ip: 0,
    deviceToken: 0,
    referrer: 0,
    referee: 0,
    managram: 0,
  }
  for (const { matchReasons } of relatedUsers) {
    for (const reason of matchReasons) counts[reason]++
  }

  const parts = (Object.keys(MATCH_REASON_LABELS) as MatchReason[])
    .filter((reason) => counts[reason] > 0)
    .map((reason) => `${counts[reason]} ${MATCH_REASON_LABELS[reason]}`)

  if (parts.length === 0) {
    return `Found ${relatedUsers.length} related account${
      relatedUsers.length !== 1 ? 's' : ''
    }.`
  }
  return `Found ${parts.join(', ')}.`
}

function BonusEligibilitySection({
  user,
  onUpdate,
}: {
  user: FullUser
  onUpdate: (user: FullUser) => void
}) {
  const [isUpdating, setIsUpdating] = useState(false)
  // 'requires_verification' isn't selectable in this control — that path goes
  // through FlagForVerificationSection below. Normalize it to undefined here
  // so the local state stays within what admin-set-bonus-eligibility accepts.
  const initialEligibility =
    user.bonusEligibility === 'requires_verification'
      ? undefined
      : user.bonusEligibility
  const [selectedEligibility, setSelectedEligibility] = useState<
    'verified' | 'grandfathered' | 'eligible' | 'ineligible' | null | undefined
  >(initialEligibility)

  const eligibilityOptions = [
    {
      value: 'verified' as const,
      label: 'Verified',
      description: 'Passed iDenfy identity verification',
      color: 'text-green-600',
    },
    {
      value: 'grandfathered' as const,
      label: 'Grandfathered',
      description: 'Active user before KYC requirement',
      color: 'text-blue-600',
    },
    {
      value: 'eligible' as const,
      label: 'Eligible (bonuses only)',
      description:
        'Gets bonuses without KYC (purchaser or hand-granted). Does NOT unlock prize drawings.',
      color: 'text-teal-600',
    },
    {
      value: 'ineligible' as const,
      label: 'Ineligible',
      description: 'Not eligible for bonuses',
      color: 'text-red-600',
    },
    {
      value: null,
      label: 'Require Verification',
      description:
        'Clear eligibility - user must complete iDenfy to get bonuses',
      color: 'text-orange-600',
    },
  ] as const

  // 'requires_verification' is set via the dedicated FlagForVerificationSection
  // below, not via this generic setter — so it isn't in eligibilityOptions.
  // Surface it as its own status label when present.
  const isFlaggedForVerification =
    user.bonusEligibility === 'requires_verification'
  const currentEligibility = eligibilityOptions.find(
    (o) => o.value === (user.bonusEligibility ?? null)
  )

  const handleUpdate = async () => {
    if (selectedEligibility === undefined) return
    if ((selectedEligibility ?? null) === (user.bonusEligibility ?? null))
      return

    setIsUpdating(true)
    try {
      await api('admin-set-bonus-eligibility', {
        userId: user.id,
        bonusEligibility: selectedEligibility,
      })
      toast.success(
        selectedEligibility === null
          ? 'Cleared eligibility - user must re-verify'
          : `Bonus eligibility updated to '${selectedEligibility}'`
      )
      onUpdate({
        ...user,
        bonusEligibility: selectedEligibility ?? undefined,
      })
    } catch (error) {
      toast.error(
        'Failed to update: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="border-ink-200 mb-4 space-y-3 rounded border p-4">
      <h3 className="font-semibold">Bonus Eligibility</h3>
      <div className="space-y-2">
        <div>
          <span className="text-ink-600 text-sm">Current Status: </span>
          {isFlaggedForVerification ? (
            <span className="font-medium text-amber-600">
              Flagged for Verification
            </span>
          ) : (
            <span
              className={`font-medium ${
                currentEligibility?.color ?? 'text-orange-600'
              }`}
            >
              {currentEligibility?.label ?? 'Not Set (Pending)'}
            </span>
          )}
          {!isFlaggedForVerification && currentEligibility && (
            <span className="text-ink-500 ml-2 text-sm">
              - {currentEligibility.description}
            </span>
          )}
          {isFlaggedForVerification && user.verificationFlagReason && (
            <div className="text-ink-500 mt-1 text-sm">
              <strong>Flag reason:</strong> {user.verificationFlagReason}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <label className="text-ink-700 block text-sm font-medium">
            Change Eligibility:
          </label>
          <Row className="flex-wrap gap-2">
            {eligibilityOptions.map((option) => (
              <button
                key={String(option.value)}
                onClick={() => setSelectedEligibility(option.value)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedEligibility === option.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-ink-200 hover:border-ink-300 bg-canvas-0'
                }`}
              >
                <span className={option.color}>{option.label}</span>
              </button>
            ))}
          </Row>
        </div>

        {selectedEligibility !== undefined &&
          (selectedEligibility ?? null) !== (user.bonusEligibility ?? null) && (
            <Row className="mt-3 gap-2">
              <Button
                onClick={handleUpdate}
                loading={isUpdating}
                disabled={isUpdating}
                color="indigo"
                size="sm"
              >
                Update Eligibility
              </Button>
              <Button
                onClick={() => setSelectedEligibility(initialEligibility)}
                disabled={isUpdating}
                color="gray-outline"
                size="sm"
              >
                Cancel
              </Button>
            </Row>
          )}
      </div>

      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Bonus eligibility controls whether the user can
          receive site bonuses (signup bonus, referral bonus, quest rewards,
          league prizes, etc.).
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-blue-700">
          <li>
            <strong>Verified:</strong> User passed iDenfy identity verification
          </li>
          <li>
            <strong>Grandfathered:</strong> Active user before KYC was required
          </li>
          <li>
            <strong>Ineligible:</strong> User failed verification or is
            otherwise not eligible
          </li>
          <li>
            <strong>Require Verification / Not Set:</strong> User must complete
            iDenfy verification to receive bonuses. Use this to end a user's
            grandfathered status.
          </li>
        </ul>
      </div>
    </div>
  )
}

function PrizeEligibilitySection({
  user,
  onUpdate,
}: {
  user: FullUser
  onUpdate: (user: FullUser) => void
}) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedEligibility, setSelectedEligibility] = useState<
    'eligible' | 'ineligible' | null | undefined
  >(user.prizeEligibility)
  const [voidEntries, setVoidEntries] = useState(false)
  const [reason, setReason] = useState('')

  const eligibilityOptions = [
    {
      value: 'eligible' as const,
      label: 'Eligible',
      description: 'May enter prize drawings',
      color: 'text-green-600',
    },
    {
      value: 'ineligible' as const,
      label: 'Ineligible',
      description: 'Barred from prize drawings',
      color: 'text-red-600',
    },
    {
      value: null,
      label: 'Follow Identity Verification',
      description:
        'Default - prize access derives from KYC identity verification (verified/grandfathered only). Bonus-only "eligible" purchasers do NOT get prize access.',
      color: 'text-orange-600',
    },
  ] as const

  const currentEligibility = eligibilityOptions.find(
    (o) => o.value === (user.prizeEligibility ?? null)
  )

  const handleUpdate = async () => {
    if (selectedEligibility === undefined) return
    if ((selectedEligibility ?? null) === (user.prizeEligibility ?? null))
      return

    const trimmedReason = reason.trim()
    const shouldVoid = voidEntries && selectedEligibility === 'ineligible'

    setIsUpdating(true)
    try {
      const res = await api('admin-set-prize-eligibility', {
        userId: user.id,
        prizeEligibility: selectedEligibility,
        ...(shouldVoid ? { voidOutstandingEntries: true } : {}),
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      })
      const refundMsg =
        res.voidedEntryCount > 0
          ? ` Voided ${res.voidedEntryCount} ${
              res.voidedEntryCount === 1 ? 'entry' : 'entries'
            }, refunded ${res.refundedManaTotal} mana.`
          : ''
      toast.success(
        (selectedEligibility === null
          ? 'Cleared prize override - follows identity verification'
          : `Prize eligibility updated to '${selectedEligibility}'`) + refundMsg
      )
      onUpdate({
        ...user,
        prizeEligibility: selectedEligibility ?? undefined,
      })
      setVoidEntries(false)
      setReason('')
    } catch (error) {
      toast.error(
        'Failed to update: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="border-ink-200 mb-4 space-y-3 rounded border p-4">
      <h3 className="font-semibold">Prize Drawing Eligibility</h3>
      <div className="space-y-2">
        <div>
          <span className="text-ink-600 text-sm">Current Status: </span>
          <span
            className={`font-medium ${
              currentEligibility?.color ?? 'text-orange-600'
            }`}
          >
            {currentEligibility?.label ?? 'Follow Bonus Eligibility'}
          </span>
          {currentEligibility && (
            <span className="text-ink-500 ml-2 text-sm">
              - {currentEligibility.description}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <label className="text-ink-700 block text-sm font-medium">
            Change Eligibility:
          </label>
          <Row className="flex-wrap gap-2">
            {eligibilityOptions.map((option) => (
              <button
                key={String(option.value)}
                onClick={() => setSelectedEligibility(option.value)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedEligibility === option.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-ink-200 hover:border-ink-300 bg-canvas-0'
                }`}
              >
                <span className={option.color}>{option.label}</span>
              </button>
            ))}
          </Row>
        </div>

        {selectedEligibility === 'ineligible' && (
          <div className="mt-2 space-y-2">
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Reason (optional, stamped onto voided entry rows):
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. under-18 (iDenfy ID-UA18)"
                maxLength={500}
                className="border-ink-200 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <label className="text-ink-700 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={voidEntries}
                onChange={(e) => setVoidEntries(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Void this user's outstanding entries and refund the mana they
                paid. Recommended for under-18 / wrongly-charged cases — they
                bought entries they can't win.
              </span>
            </label>
          </div>
        )}

        {selectedEligibility !== undefined &&
          (selectedEligibility ?? null) !== (user.prizeEligibility ?? null) && (
            <Row className="mt-3 gap-2">
              <Button
                onClick={handleUpdate}
                loading={isUpdating}
                disabled={isUpdating}
                color="indigo"
                size="sm"
              >
                Update Eligibility
              </Button>
              <Button
                onClick={() => {
                  setSelectedEligibility(user.prizeEligibility)
                  setVoidEntries(false)
                  setReason('')
                }}
                disabled={isUpdating}
                color="gray-outline"
                size="sm"
              >
                Cancel
              </Button>
            </Row>
          )}
      </div>

      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Prize eligibility controls whether the user can
          enter prize drawings (cash raffles). It is independent of bonus
          eligibility, so a user can be eligible for bonuses but not prizes, or
          vice versa.
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-blue-700">
          <li>
            <strong>Eligible:</strong> User may enter prize drawings regardless
            of bonus eligibility
          </li>
          <li>
            <strong>Ineligible:</strong> User is barred from prize drawings even
            if bonus-eligible
          </li>
          <li>
            <strong>Follow Identity Verification / Not Set:</strong> Prize
            access derives from KYC identity verification
            (verified/grandfathered only) — the default. Bonus-only
            &quot;eligible&quot; purchasers stay gated until they complete KYC.
            Use the explicit options above to decouple the two.
          </li>
        </ul>
      </div>
    </div>
  )
}

function FlagForVerificationSection({
  user,
  onUpdate,
}: {
  user: FullUser
  onUpdate: (user: FullUser) => void
}) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [reason, setReason] = useState('')

  const isFlagged = user.bonusEligibility === 'requires_verification'

  const handleFlag = async () => {
    const trimmed = reason.trim()
    setIsUpdating(true)
    try {
      await api('admin-flag-for-verification', {
        userId: user.id,
        flag: true,
        ...(trimmed ? { reason: trimmed } : {}),
      })
      toast.success(
        'Flagged — user must complete iDenfy to unlock bonus eligibility'
      )
      onUpdate({
        ...user,
        bonusEligibility: 'requires_verification',
        verificationFlagReason: trimmed || undefined,
      })
      setReason('')
      // Prior eligibility is snapshotted server-side; clearing the flag will
      // restore it (see handleClear).
    } catch (error) {
      toast.error(
        'Failed to flag: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const handleClear = async () => {
    setIsUpdating(true)
    try {
      const res = await api('admin-flag-for-verification', {
        userId: user.id,
        flag: false,
      })
      toast.success(
        res.bonusEligibility
          ? `Cleared flag — restored bonus eligibility to '${res.bonusEligibility}'`
          : 'Cleared verification flag'
      )
      onUpdate({
        ...user,
        // Server restores the pre-flag eligibility if one was snapshotted.
        bonusEligibility: res.bonusEligibility,
        verificationFlagReason: undefined,
      })
      setReason('')
    } catch (error) {
      toast.error(
        'Failed to clear: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="border-ink-200 mb-4 space-y-3 rounded border p-4">
      <h3 className="font-semibold">Flag for Verification</h3>
      <p className="text-ink-600 text-sm">
        Use this for users you want to force through identity verification
        before bonuses unlock — suspected alts, suspicious signups, manual
        review. Independent of the prize-eligibility axis.
      </p>

      {isFlagged ? (
        <div className="space-y-2">
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Currently flagged.</strong> User cannot receive bonuses
            until they complete iDenfy verification.
            {user.verificationFlagReason && (
              <div className="mt-1">
                <strong>Reason:</strong> {user.verificationFlagReason}
              </div>
            )}
          </div>
          <Button
            onClick={handleClear}
            loading={isUpdating}
            disabled={isUpdating}
            color="gray-outline"
            size="sm"
          >
            Clear flag
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-ink-700 block text-sm font-medium">
            Reason (optional, shown to other admins):
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. suspected alt of @other-user"
            maxLength={500}
            className="border-ink-200 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm"
          />
          <Button
            onClick={handleFlag}
            loading={isUpdating}
            disabled={isUpdating}
            color="amber"
            size="sm"
          >
            Flag for Verification
          </Button>
        </div>
      )}
    </div>
  )
}
