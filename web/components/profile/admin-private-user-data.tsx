import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function AdminPrivateUserData(props: { userId: string }) {
  const { userId } = props
  const { data: privateUser, loading } = useAPIGetter('get-user-private-data', {
    userId,
  })

  if (loading) {
    return <LoadingIndicator />
  }

  if (!privateUser) {
    return <div className="text-ink-600">No private user data found</div>
  }

  // Exclude notification preferences as requested
  const { initialIpAddress, initialDeviceToken, email } = privateUser

  return (
    <Col className="gap-4">
      <div className="text-ink-600 text-sm">
        Admin-only view of private user data
      </div>
      <div className="bg-canvas-50 rounded-lg p-4">
        <pre className="text-ink-1000 whitespace-pre-wrap break-words text-sm">
          {JSON.stringify(
            { initialIpAddress, initialDeviceToken, email },
            null,
            2
          )}
        </pre>
      </div>
    </Col>
  )
}
