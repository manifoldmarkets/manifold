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
import { DisplayUser, searchUsers, getFullUserById } from 'web/lib/supabase/users'
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
  } | null>(null)
  const [manualEmail, setManualEmail] = useState('')
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false)
  const [relatedUsers, setRelatedUsers] = useState<
    Array<{
      visibleUser: FullUser
      matchReasons: ('ip' | 'deviceToken')[]
    }>
  >([])
  const [isLoadingRelatedUsers, setIsLoadingRelatedUsers] = useState(false)

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
    }
  }, [selectedUser])

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
                <h3 className="font-semibold">Related Accounts (Potential Alts)</h3>
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
                        Found {relatedUsers.length} account
                        {relatedUsers.length !== 1 ? 's' : ''} with matching IP
                        or device token.
                      </p>
                    </div>
                    {relatedUsers.map(({ visibleUser, matchReasons }) => (
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
                            </div>
                            <div className="text-ink-600 text-sm">
                              @{visibleUser.username}
                            </div>
                          </div>
                        </button>
                        <div className="flex gap-2">
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
                        </div>
                      </div>
                    ))}
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
