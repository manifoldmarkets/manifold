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
import { Modal } from 'web/components/layout/modal'
import { api } from 'web/lib/api/api'
import { useState } from 'react'

export function BanBanner({ bans }: { bans: UserBan[] }) {
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<number>>(
    new Set()
  )
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  const activeBanTypes = getActiveBlockingBans(bans)
  const modAlerts = getActiveModAlerts(bans).filter(
    (a) => !dismissedAlertIds.has(a.id)
  )

  // Don't show if no bans and no alerts
  if (activeBanTypes.length === 0 && modAlerts.length === 0) {
    return null
  }

  const handleDismissAlert = async (alertId: number) => {
    try {
      await api('dismiss-mod-alert', { alertId })
      setDismissedAlertIds((prev) => new Set([...prev, alertId]))
    } catch (error) {
      console.error('Failed to dismiss mod alert:', error)
    }
  }

  // Build summary text
  const hasBans = activeBanTypes.length > 0
  const banSummary = hasBans
    ? activeBanTypes.map((bt) => getBanTypeDisplayName(bt)).join(', ')
    : null
  const alertCount = modAlerts.length
  const alertsOnly = !hasBans && alertCount > 0

  return (
    <>
      {/* Compact banner - scrolls with content */}
      <div className="mb-3">
        <Row
          className={`items-center justify-between gap-2 px-4 py-2.5 text-white ${
            alertsOnly ? 'bg-yellow-600' : 'bg-red-600'
          }`}
        >
          <Row className="items-center gap-2 text-sm">
            <span className="font-semibold">
              {alertsOnly ? 'Moderator Alert' : 'Account Restricted'}
            </span>
            {!alertsOnly && (
              <>
                <span className="hidden sm:inline">-</span>
                <span className="hidden text-red-100 sm:inline">
                  {banSummary && `${banSummary} banned`}
                </span>
                {alertCount > 0 && (
                  <Row className="hidden items-center gap-1 sm:flex">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-yellow-900">
                      !
                    </span>
                    <span className="text-yellow-200">
                      {alertCount} alert{alertCount > 1 ? 's' : ''}
                    </span>
                  </Row>
                )}
              </>
            )}
            {alertsOnly && (
              <span className="hidden text-yellow-100 sm:inline">
                {alertCount} message{alertCount > 1 ? 's' : ''} from moderators
              </span>
            )}
          </Row>
          <button
            onClick={() => setShowDetailsModal(true)}
            className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
          >
            View Details
          </button>
        </Row>
      </div>

      {/* Details Modal */}
      <Modal open={showDetailsModal} setOpen={setShowDetailsModal} size="md">
        <Col className="bg-canvas-0 gap-6 rounded-lg p-6">
          {/* Header */}
          <div className="border-ink-200 border-b pb-4">
            <h2 className="text-xl font-bold">
              {alertsOnly ? 'Moderator Alerts' : 'Account Status'}
            </h2>
            <p className="text-ink-500 text-sm">
              {alertsOnly ? (
                `${modAlerts.length} message${
                  modAlerts.length !== 1 ? 's' : ''
                } from moderators`
              ) : (
                <>
                  {activeBanTypes.length} restriction
                  {activeBanTypes.length !== 1 ? 's' : ''}
                  {modAlerts.length > 0 &&
                    `, ${modAlerts.length} alert${
                      modAlerts.length !== 1 ? 's' : ''
                    }`}
                </>
              )}
            </p>
          </div>

          {/* Ban details */}
          {activeBanTypes.length > 0 && (
            <BanDetailsSection bans={bans} activeBanTypes={activeBanTypes} />
          )}

          {/* Mod alerts */}
          {modAlerts.length > 0 && (
            <Col className="gap-3">
              {/* Only show section header if there are also bans */}
              {!alertsOnly && (
                <Row className="items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100">
                    <span className="text-xs font-bold text-yellow-600">!</span>
                  </div>
                  <h3 className="font-semibold">Moderator Alerts</h3>
                </Row>
              )}
              {modAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 shadow-sm"
                >
                  <Row className="items-start justify-between gap-3">
                    <p className="text-yellow-900">{alert.reason}</p>
                    <button
                      onClick={() => handleDismissAlert(alert.id)}
                      className="shrink-0 rounded px-2 py-1 text-xs font-medium text-yellow-700 transition-colors hover:bg-yellow-200 hover:text-yellow-800"
                    >
                      Dismiss
                    </button>
                  </Row>
                </div>
              ))}
            </Col>
          )}

          {/* Footer */}
          <div className="border-ink-200 border-t pt-4">
            <button
              onClick={() => setShowDetailsModal(false)}
              className="bg-primary-500 hover:bg-primary-600 w-full rounded-lg px-4 py-2 font-medium text-white transition-colors"
            >
              Got it
            </button>
          </div>
        </Col>
      </Modal>
    </>
  )
}

function BanDetailsSection({
  bans,
  activeBanTypes,
}: {
  bans: UserBan[]
  activeBanTypes: BanType[]
}) {
  return (
    <Col className="gap-3">
      <Row className="items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
          <span className="text-xs font-bold text-red-600">!</span>
        </div>
        <h3 className="font-semibold">Active Restrictions</h3>
      </Row>
      {/* Ban type cards with integrated reasons */}
      <div className="grid gap-3">
        {activeBanTypes.map((banType) => (
          <BanTypeCard key={banType} bans={bans} banType={banType} />
        ))}
      </div>
    </Col>
  )
}

function BanTypeCard({ bans, banType }: { bans: UserBan[]; banType: BanType }) {
  const timeRemaining = getBanTimeRemaining(bans, banType)
  const ban = getActiveBan(bans, banType)
  const isPermanent = ban && !ban.end_time

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <Row className="items-start justify-between gap-2">
        <Col className="flex-1 gap-1">
          <Row className="items-center gap-2">
            <span className="font-medium text-red-900">
              {getBanTypeDisplayName(banType)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isPermanent
                  ? 'bg-red-200 text-red-800'
                  : 'bg-orange-100 text-orange-800'
              }`}
            >
              {isPermanent
                ? 'Permanent'
                : timeRemaining !== undefined && timeRemaining > 0
                ? formatBanTimeRemaining(timeRemaining)
                : 'Active'}
            </span>
          </Row>
          <span className="text-xs text-red-700">
            {getBanTypeDescription(banType)}
          </span>
          {ban?.reason && (
            <p className="mt-1 text-sm text-red-800">
              <span className="font-medium">Reason:</span>{' '}
              <span className="italic">"{ban.reason}"</span>
            </p>
          )}
        </Col>
      </Row>
    </div>
  )
}
