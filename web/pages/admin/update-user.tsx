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
import { DisplayUser, searchUsers } from 'web/lib/supabase/users'

export default function AdminUpdateUserPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DisplayUser[]>([])
  const [selectedUser, setSelectedUser] = useState<FullUser | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    avatarUrl: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestId = useRef(0)

  // Search for users
  useEffect(() => {
    const id = ++requestId.current
    if (query.length > 1) {
      searchUsers(query, 10).then((results) => {
        if (id === requestId.current) {
          setSearchResults(results)
        }
      })
    } else {
      setSearchResults([])
    }
  }, [query])

  // Update form when user is selected
  useEffect(() => {
    if (selectedUser) {
      setFormData({
        name: selectedUser.name || '',
        username: selectedUser.username || '',
        avatarUrl: selectedUser.avatarUrl || '',
      })
    }
  }, [selectedUser])

  const selectUser = (user: DisplayUser) => {
    setSelectedUser(user as FullUser)
    setQuery('')
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    setIsSubmitting(true)
    try {
      const updates: any = {
        userId: selectedUser.id,
      }

      // Only include changed fields
      if (formData.name !== selectedUser.name) {
        updates.name = formData.name
      }
      if (formData.username !== selectedUser.username) {
        updates.username = formData.username
      }
      if (formData.avatarUrl !== selectedUser.avatarUrl) {
        updates.avatarUrl = formData.avatarUrl
      }

      const result = await api('me/update', updates)
      toast.success('User updated successfully!')

      // Update selected user with new data
      setSelectedUser(result)
    } catch (error) {
      console.error('Error updating user:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to update user'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateNewAvatar = async () => {
    if (!selectedUser) return

    setIsSubmitting(true)
    try {
      const result = await api('me/update', {
        userId: selectedUser.id,
        avatarUrl: '', // Empty string triggers avatar generation
      })
      toast.success('New avatar generated!')
      setSelectedUser(result)
      setFormData((prev) => ({ ...prev, avatarUrl: result.avatarUrl }))
    } catch (error) {
      console.error('Error generating avatar:', error)
      toast.error('Failed to generate new avatar')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={'admin update user page'}>
      <NoSEO />
      <div className="mx-8">
        <Title>Admin - Update User</Title>

        <Col className="gap-6">
          {/* User Search Section */}
          <div>
            <h2 className="mb-4 text-lg font-semibold">Search for User</h2>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name or username..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full max-w-md"
              />

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
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-ink-600 text-sm">
                          @{user.username}
                        </div>
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

              {/* Edit Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-ink-700 mb-2 block text-sm font-medium">
                    Display Name
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full max-w-md"
                  />
                </div>

                <div>
                  <label className="text-ink-700 mb-2 block text-sm font-medium">
                    Username
                  </label>
                  <Input
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                    className="w-full max-w-md"
                  />
                </div>

                <div>
                  <label className="text-ink-700 mb-2 block text-sm font-medium">
                    Avatar URL
                  </label>
                  <Row className="gap-2">
                    <Input
                      type="url"
                      value={formData.avatarUrl}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          avatarUrl: e.target.value,
                        }))
                      }
                      className="max-w-md flex-1"
                    />
                    <Button
                      type="button"
                      onClick={generateNewAvatar}
                      disabled={isSubmitting}
                      color="gray"
                      size="sm"
                    >
                      Generate New
                    </Button>
                  </Row>
                </div>

                <Row className="gap-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    loading={isSubmitting}
                  >
                    Update User
                  </Button>

                  <Button
                    type="button"
                    color="gray"
                    onClick={() => setSelectedUser(null)}
                  >
                    Cancel
                  </Button>
                </Row>
              </form>
            </div>
          )}
        </Col>
      </div>
    </Page>
  )
}
