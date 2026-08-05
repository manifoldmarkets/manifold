import { useState } from 'react'
import { DOMAIN } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'

export default function CreateInstancePage() {
  useRedirectIfSignedOut()
  const user = useUser()
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const { subdomain } = await api('create-instance', { name: name.trim() })
      window.location.href = `https://${subdomain}.${DOMAIN}`
    } catch (e) {
      setError(
        e instanceof APIError ? e.message : 'Failed to create your instance.'
      )
      setIsLoading(false)
    }
  }

  if (!user) return <></>

  return (
    <Page trackPageView={'create instance page'}>
      <Col className="mx-auto max-w-lg gap-4 p-4">
        <Title>Create your own private Manifold</Title>
        <p className="text-ink-600">
          Spin up a private Manifold instance with an empty database, on its own
          subdomain. You'll start with a fresh mana balance there, separate from
          your account on the main site.
        </p>
        <Col className="gap-1">
          <label className="text-ink-700 text-sm font-medium" htmlFor="name">
            Instance name
          </label>
          <Input
            id="name"
            placeholder="My Team"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
          />
        </Col>
        {error && <div className="text-error text-sm">{error}</div>}
        <Button
          onClick={submit}
          loading={isLoading}
          disabled={isLoading || !name.trim()}
        >
          Create instance
        </Button>
      </Col>
    </Page>
  )
}
