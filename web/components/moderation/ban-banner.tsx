import { User } from 'common/user'
import {
  BanType,
  getActiveBans,
  getBanTimeRemaining,
  getBanTypeDisplayName,
  getBanTypeDescription,
  formatBanTimeRemaining,
} from 'common/ban-utils'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { api } from 'web/lib/api/api'
import { useState } from 'react'

export function BanBanner({ user }: { user: User }) {
  const [alertDismissed, setAlertDismissed] = useState(false)
  const activeBans = getActiveBans(user)
  const modAlert = user.modAlert
  const showModAlert =
    modAlert && !modAlert.dismissed && !alertDismissed

  // Don't show if no bans and no alert (or alert already dismissed)
  if (activeBans.length === 0 && !showModAlert) {
    return null
  }

  const handleDismissAlert = async () => {
    if (modAlert && !modAlert.dismissed) {
      try {
        await api('dismiss-mod-alert', {})
        setAlertDismissed(true)
      } catch (error) {
        console.error('Failed to dismiss mod alert:', error)
      }
    }
  }

  // Get ban reason (prefer the most recent one)
  const banReason =
    user.bans?.posting?.reason ||
    user.bans?.marketControl?.reason ||
    user.bans?.trading?.reason

  return (
    <Col className="mb-4 gap-3">
      {/* Ban section */}
      {activeBans.length > 0 && (
        <div className="rounded border-2 border-red-500 bg-red-100 p-4">
          <Col className="gap-2">
            <h3 className="font-bold text-red-900">⛔ Account Restricted</h3>
            <p className="text-red-800">You have been restricted from:</p>
            <ul className="list-inside list-disc space-y-1 text-red-800">
              {activeBans.map((banType) => (
                <BanTypeDescription
                  key={banType}
                  user={user}
                  banType={banType}
                />
              ))}
            </ul>
            {banReason && (
              <div className="border-ink-200 mt-2 rounded border bg-white p-3">
                <p className="font-semibold text-red-900">Reason:</p>
                <p className="text-red-800">{banReason}</p>
              </div>
            )}
          </Col>
        </div>
      )}

      {/* Mod alert section (separate and dismissable) */}
      {showModAlert && (
        <div className="rounded border-2 border-yellow-500 bg-yellow-100 p-4">
          <Row className="items-start justify-between">
            <Col className="flex-1 gap-2">
              <h3 className="font-bold text-yellow-900">⚠️ Moderator Alert</h3>
              <div className="border-ink-200 rounded border bg-white p-3">
                <p className="text-yellow-900">{modAlert.message}</p>
              </div>
            </Col>
            <button
              onClick={handleDismissAlert}
              className="text-yellow-700 hover:text-yellow-900 ml-2 text-xl"
              title="Dismiss alert"
            >
              ✕
            </button>
          </Row>
        </div>
      )}
    </Col>
  )
}

function BanTypeDescription({ user, banType }: { user: User; banType: BanType }) {
  const timeRemaining = getBanTimeRemaining(user, banType)
  const ban = user.bans?.[banType]

  return (
    <li>
      <strong>
        {getBanTypeDisplayName(banType)} ({getBanTypeDescription(banType)})
      </strong>
      {timeRemaining !== undefined && timeRemaining > 0 && (
        <span className="text-sm">
          {' '}
          — Expires in {formatBanTimeRemaining(timeRemaining)}
        </span>
      )}
      {ban && !ban.unbanTime && <span className="text-sm"> — Permanent</span>}
    </li>
  )
}
