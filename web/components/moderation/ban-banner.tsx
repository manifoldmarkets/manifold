import { UserBan } from 'common/user'
import {
  BanType,
  getActiveBan,
  getBanTimeRemaining,
  getBanTypeDisplayName,
  getBanTypeDescription,
  formatBanTimeRemaining,
  getActiveBlockingBans,
  getActiveModAlerts,
} from 'common/ban-utils'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { api } from 'web/lib/api/api'
import { useState } from 'react'

export function BanBanner({ bans }: { bans: UserBan[] }) {
  // Track which alert IDs have been dismissed locally (before page refresh)
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<number>>(new Set())
  const activeBanTypes = getActiveBlockingBans(bans)
  const modAlerts = getActiveModAlerts(bans).filter(a => !dismissedAlertIds.has(a.id))

  // Don't show if no bans and no alerts
  if (activeBanTypes.length === 0 && modAlerts.length === 0) {
    return null
  }

  const handleDismissAlert = async (alertId: number) => {
    try {
      await api('dismiss-mod-alert', { alertId })
      setDismissedAlertIds(prev => new Set([...prev, alertId]))
    } catch (error) {
      console.error('Failed to dismiss mod alert:', error)
    }
  }

  // Group ban reasons - same reason may apply to multiple ban types
  const reasonToBanTypes: Map<string, BanType[]> = new Map()
  for (const banType of activeBanTypes) {
    const ban = getActiveBan(bans, banType)
    if (ban?.reason) {
      const existing = reasonToBanTypes.get(ban.reason) || []
      existing.push(banType)
      reasonToBanTypes.set(ban.reason, existing)
    }
  }
  // Convert to array for rendering
  const groupedReasons = Array.from(reasonToBanTypes.entries()).map(
    ([reason, banTypes]) => ({ reason, banTypes })
  )

  return (
    <Col className="mb-4 gap-3">
      {/* Ban section */}
      {activeBanTypes.length > 0 && (
        <div className="rounded border-2 border-red-500 bg-red-100 p-4">
          <Col className="gap-2">
            <h3 className="font-bold text-red-900">Account Restricted</h3>
            <p className="text-red-800">You have been restricted from:</p>
            <ul className="list-inside list-disc space-y-1 text-red-800">
              {activeBanTypes.map((banType) => (
                <BanTypeDescription
                  key={banType}
                  bans={bans}
                  banType={banType}
                />
              ))}
            </ul>
            {groupedReasons.length > 0 && (
              <div className="border-ink-200 mt-2 rounded border bg-white p-3">
                <p className="font-semibold text-red-900">
                  {groupedReasons.length === 1 ? 'Reason:' : 'Reasons:'}
                </p>
                {groupedReasons.map(({ reason, banTypes }) => (
                  <p key={reason} className="text-red-800">
                    {groupedReasons.length > 1 && (
                      <span className="font-medium">
                        {banTypes.map((bt) => getBanTypeDisplayName(bt)).join(' + ')}:{' '}
                      </span>
                    )}
                    {reason}
                  </p>
                ))}
              </div>
            )}
          </Col>
        </div>
      )}

      {/* Mod alerts section (each alert is separate and dismissable) */}
      {modAlerts.map((alert) => (
        <div
          key={alert.id}
          className="rounded border-2 border-yellow-500 bg-yellow-100 p-4"
        >
          <Row className="items-start justify-between">
            <Col className="flex-1 gap-2">
              <h3 className="font-bold text-yellow-900">Moderator Alert</h3>
              <div className="border-ink-200 rounded border bg-white p-3">
                <p className="text-yellow-900">{alert.reason}</p>
              </div>
            </Col>
            <button
              onClick={() => handleDismissAlert(alert.id)}
              className="ml-2 text-xl text-yellow-700 hover:text-yellow-900"
              title="Dismiss alert"
            >
              ×
            </button>
          </Row>
        </div>
      ))}
    </Col>
  )
}

function BanTypeDescription({ bans, banType }: { bans: UserBan[]; banType: BanType }) {
  const timeRemaining = getBanTimeRemaining(bans, banType)
  const ban = getActiveBan(bans, banType)

  return (
    <li>
      <strong>
        {getBanTypeDisplayName(banType)} ({getBanTypeDescription(banType)})
      </strong>
      {timeRemaining !== undefined && timeRemaining > 0 && (
        <span className="text-sm">
          {' '}
          - Expires in {formatBanTimeRemaining(timeRemaining)}
        </span>
      )}
      {ban && !ban.end_time && <span className="text-sm"> - Permanent</span>}
    </li>
  )
}
