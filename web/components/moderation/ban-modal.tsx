import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/outline'
import { User, UserBan, BanType } from 'common/user'
import {
  formatBanTimeRemaining,
  getActiveBans,
  getActiveBan,
  getBanTimeRemaining,
  getActiveBanRecords,
  getActiveBlockingBans,
  getActiveModAlerts,
  getBanTypeDisplayName,
  getBanTypeDescription,
} from 'common/ban-utils'
import { DAY_MS } from 'common/util/time'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { getUserById } from 'web/lib/supabase/users'

export function BanModal({
  user,
  bans,
  isOpen,
  onClose,
}: {
  user: User
  bans: UserBan[]
  isOpen: boolean
  onClose: () => void
}) {
  const [banTypes, setBanTypes] = useState({
    posting: false,
    marketControl: false,
    trading: false,
  })

  const [tempBanDays, setTempBanDays] = useState<{
    posting?: number
    marketControl?: number
    trading?: number
  }>({})

  const [reason, setReason] = useState('')
  const [modAlertOnly, setModAlertOnly] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCurrentBans, setShowCurrentBans] = useState(true)
  const [showBanHistory, setShowBanHistory] = useState(false)
  const [modNames, setModNames] = useState<Record<string, string>>({})

  // Unban confirmation modal state
  const [unbanModalOpen, setUnbanModalOpen] = useState(false)
  const [unbanBanType, setUnbanBanType] = useState<BanType | null>(null)

  // Remove all bans modal state
  const [removeAllBansModalOpen, setRemoveAllBansModalOpen] = useState(false)

  // Username change restriction - default to true (restrict) when any ban is selected
  const [allowUsernameChange, setAllowUsernameChange] = useState<boolean | undefined>(undefined)

  // Get active and historical bans
  const activeBanRecords = getActiveBanRecords(bans).filter(b => b.ban_type !== 'modAlert')
  const activeBanTypes = getActiveBlockingBans(bans)
  const activeModAlerts = getActiveModAlerts(bans)
  const historicalBans = bans.filter(b => b.ended_at !== null)
  const isUsernameChangeRestricted = user.canChangeUsername === false
  const hasCurrentBansOrAlerts =
    activeBanTypes.length > 0 ||
    activeModAlerts.length > 0 ||
    isUsernameChangeRestricted

  useEffect(() => {
    const modIds = new Set<string>()

    // Collect mod IDs from bans (including mod alerts which are now in bans)
    for (const ban of bans) {
      if (ban.created_by) modIds.add(ban.created_by)
      if (ban.ended_by && ban.ended_by !== 'system') modIds.add(ban.ended_by)
    }

    // Fetch usernames for all mod IDs
    const fetchModNames = async () => {
      const names: Record<string, string> = {}
      for (const modId of modIds) {
        try {
          const modUser = await getUserById(modId)
          if (modUser) {
            names[modId] = modUser.username
          }
        } catch (e) {
          // Ignore errors
        }
      }
      setModNames(names)
    }

    if (modIds.size > 0) {
      fetchModNames()
    }
  }, [bans])

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason')
      return
    }

    setIsSubmitting(true)
    try {
      const unbanTimes: Record<string, number | undefined> = {}
      if (tempBanDays.posting) {
        unbanTimes.posting = Date.now() + tempBanDays.posting * DAY_MS
      }
      if (tempBanDays.marketControl) {
        unbanTimes.marketControl =
          Date.now() + tempBanDays.marketControl * DAY_MS
      }
      if (tempBanDays.trading) {
        unbanTimes.trading = Date.now() + tempBanDays.trading * DAY_MS
      }

      // Only send ban types that are being added (true)
      const bansToSend: Record<string, boolean> = {}
      if (banTypes.posting) bansToSend.posting = true
      if (banTypes.marketControl) bansToSend.marketControl = true
      if (banTypes.trading) bansToSend.trading = true

      await api('ban-user', {
        userId: user.id,
        bans: modAlertOnly ? undefined : (Object.keys(bansToSend).length > 0 ? bansToSend : undefined),
        unbanTimes: modAlertOnly ? undefined : unbanTimes,
        reason: reason.trim(),
        modAlert: modAlertOnly ? { message: reason.trim() } : undefined,
        allowUsernameChange: modAlertOnly ? undefined : allowUsernameChange,
      })

      toast.success(modAlertOnly ? 'Mod alert sent' : 'Ban updated successfully')
      onClose()
      window.location.reload()
    } catch (error) {
      toast.error('Failed to update ban: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openUnbanModal = (banType: BanType) => {
    setUnbanBanType(banType)
    setUnbanModalOpen(true)
  }

  const handleUnban = async () => {
    if (!unbanBanType) return
    setIsSubmitting(true)
    try {
      await api('ban-user', {
        userId: user.id,
        bans: { [unbanBanType]: false },
      })
      toast.success(`Removed ${unbanBanType} ban`)
      setUnbanModalOpen(false)
      window.location.reload()
    } catch (error) {
      toast.error('Failed to remove ban: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClearAlert = async (alertId: number) => {
    setIsSubmitting(true)
    try {
      // Mods clear alerts via ban-user endpoint with specific alert ID
      await api('ban-user', {
        userId: user.id,
        clearAlertId: alertId,
      })
      toast.success('Cleared mod alert')
      window.location.reload()
    } catch (error) {
      toast.error('Failed to clear alert: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReenableUsernameChange = async () => {
    setIsSubmitting(true)
    try {
      await api('ban-user', {
        userId: user.id,
        allowUsernameChange: true,
      })
      toast.success('Re-enabled @username changes')
      window.location.reload()
    } catch (error) {
      toast.error('Failed to re-enable: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveAllBans = async () => {
    setIsSubmitting(true)
    try {
      await api('ban-user', {
        userId: user.id,
        removeAllBans: true,
      })
      toast.success('All bans removed')
      setRemoveAllBansModalOpen(false)
      window.location.reload()
    } catch (error) {
      toast.error('Failed to remove bans: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const anyBanSelected = Object.values(banTypes).some((v) => v)

  return (
    <Modal open={isOpen} setOpen={onClose}>
      <Col className="bg-canvas-0 max-w-2xl gap-4 rounded-md p-6">
        <Title>Ban User: {user.name}</Title>

        {/* Current Bans/Alerts Section */}
        {hasCurrentBansOrAlerts && (
          <div className="border-ink-200 rounded border">
            <div className="flex w-full items-center gap-2 p-3">
              <button
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => setShowCurrentBans(!showCurrentBans)}
              >
                <span className="font-semibold">
                  Current Bans/Alerts ({activeBanTypes.length} ban
                  {activeBanTypes.length !== 1 ? 's' : ''}
                  {activeModAlerts.length > 0 ? `, ${activeModAlerts.length} alert${activeModAlerts.length !== 1 ? 's' : ''}` : ''})
                </span>
                {showCurrentBans ? (
                  <ChevronUpIcon className="h-5 w-5 shrink-0" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5 shrink-0" />
                )}
              </button>
              {activeBanTypes.length >= 1 && (
                <Button
                  color="red-outline"
                  size="2xs"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRemoveAllBansModalOpen(true)
                  }}
                >
                  Remove All
                </Button>
              )}
            </div>
            {showCurrentBans && (
              <div className="border-ink-200 space-y-3 border-t p-3">
                {activeBanRecords.map((ban) => {
                  const timeRemaining = getBanTimeRemaining(bans, ban.ban_type)
                  const modName = ban.created_by
                    ? modNames[ban.created_by] || ban.created_by
                    : 'Unknown'
                  return (
                    <div
                      key={ban.id}
                      className="rounded border border-red-300 bg-red-50 p-2"
                    >
                      <Row className="items-center justify-between">
                        <span className="font-medium text-red-900">
                          {ban.ban_type === 'posting'
                            ? 'Posting Ban'
                            : ban.ban_type === 'marketControl'
                              ? 'Market Control Ban'
                              : 'Trading Ban'}
                        </span>
                        <Row className="items-center gap-2">
                          <span className="text-sm text-red-700">
                            {timeRemaining
                              ? `Expires in ${formatBanTimeRemaining(timeRemaining)}`
                              : 'Permanent'}
                          </span>
                          <Button
                            color="gray-outline"
                            size="2xs"
                            onClick={() => openUnbanModal(ban.ban_type)}
                          >
                            Remove
                          </Button>
                        </Row>
                      </Row>
                      <p className="mt-1 text-sm text-red-800">
                        Reason: {ban.reason || 'No reason provided'}
                      </p>
                      <p className="text-ink-500 mt-1 text-xs">
                        Banned by: @{modName} on{' '}
                        {new Date(ban.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  )
                })}
                {activeModAlerts.map((alert) => {
                  const modName = alert.created_by
                    ? modNames[alert.created_by] || alert.created_by
                    : 'Unknown'
                  return (
                    <div
                      key={alert.id}
                      className="rounded border border-yellow-300 bg-yellow-50 p-2"
                    >
                      <Row className="items-center justify-between">
                        <span className="font-medium text-yellow-900">
                          Active Mod Alert
                        </span>
                        <Button
                          color="gray-outline"
                          size="2xs"
                          loading={isSubmitting}
                          onClick={() => handleClearAlert(alert.id)}
                        >
                          Clear
                        </Button>
                      </Row>
                      <p className="mt-1 text-sm text-yellow-800">
                        Message: {alert.reason}
                      </p>
                      <p className="text-ink-500 mt-1 text-xs">
                        Sent by: @{modName} on{' '}
                        {new Date(alert.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  )
                })}
                {isUsernameChangeRestricted && (
                  <div className="rounded border border-orange-300 bg-orange-50 p-2">
                    <Row className="items-center justify-between">
                      <span className="font-medium text-orange-900">
                        @username Changes Restricted
                      </span>
                      <Button
                        color="gray-outline"
                        size="2xs"
                        loading={isSubmitting}
                        onClick={handleReenableUsernameChange}
                      >
                        Re-enable
                      </Button>
                    </Row>
                    <p className="mt-1 text-sm text-orange-800">
                      This user cannot change their @username.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mod Alert Only Toggle */}
        <Row className="items-center gap-2">
          <input
            type="checkbox"
            checked={modAlertOnly}
            onChange={(e) => setModAlertOnly(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-ink-800 text-sm font-medium">
            Send mod alert without banning
          </span>
        </Row>

        {!modAlertOnly && (
          <>
            {/* Ban Type Toggles */}
            <div className="border-ink-200 space-y-3 rounded border p-4">
              <Row className="items-center gap-1">
                <h3 className="font-semibold">Ban Types</h3>
                <Tooltip
                  text="New bans stack with existing bans. Each ban type retains its own reason and expiry time."
                  placement="top"
                >
                  <InformationCircleIcon className="text-ink-500 h-4 w-4" />
                </Tooltip>
              </Row>

              <BanTypeToggle
                label="Posting Ban"
                description="No commenting, creating posts, or messaging"
                checked={banTypes.posting}
                onChange={(checked) =>
                  setBanTypes({ ...banTypes, posting: checked })
                }
                tempDays={tempBanDays.posting}
                onTempDaysChange={(days) =>
                  setTempBanDays({ ...tempBanDays, posting: days })
                }
              />

              <BanTypeToggle
                label="Market Control Ban"
                description="No creating, editing, resolving markets, or hiding comments"
                checked={banTypes.marketControl}
                onChange={(checked) =>
                  setBanTypes({ ...banTypes, marketControl: checked })
                }
                tempDays={tempBanDays.marketControl}
                onTempDaysChange={(days) =>
                  setTempBanDays({ ...tempBanDays, marketControl: days })
                }
              />

              <BanTypeToggle
                label="Trading Ban"
                description="No trading, managrams, or liquidity changes"
                checked={banTypes.trading}
                onChange={(checked) =>
                  setBanTypes({ ...banTypes, trading: checked })
                }
                tempDays={tempBanDays.trading}
                onTempDaysChange={(days) =>
                  setTempBanDays({ ...tempBanDays, trading: days })
                }
              />
            </div>

            {/* Username Change Restriction Notice */}
            {anyBanSelected && !isUsernameChangeRestricted && (
              <div className="border-ink-200 rounded border bg-orange-50 p-3">
                <Row className="items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowUsernameChange !== true}
                    onChange={(e) =>
                      setAllowUsernameChange(e.target.checked ? undefined : true)
                    }
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-orange-900">
                    Restrict @username changes
                  </span>
                  <Tooltip
                    text="Any ban will permanently remove this user's ability to change their @username until it is manually re-enabled by a mod."
                    placement="top"
                  >
                    <InformationCircleIcon className="h-4 w-4 text-orange-700" />
                  </Tooltip>
                </Row>
              </div>
            )}
          </>
        )}

        {/* Ban Reason / Mod Alert */}
        <Col className="gap-2">
          <label className="text-ink-800 font-medium">
            {modAlertOnly ? 'Mod Alert Message' : 'Ban Reason (shown to user)'}
            <span className="text-red-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              modAlertOnly
                ? 'Enter message to show user...'
                : 'Explain why this user is being banned...'
            }
            className="border-ink-300 min-h-[100px] rounded border p-2"
          />
        </Col>

        {/* Preview */}
        {(anyBanSelected || modAlertOnly) && reason.trim() && (
          <Col className="gap-2">
            <h4 className="text-ink-700 font-semibold">
              Preview (User will see):
            </h4>
            <div className="bg-canvas-50 rounded border p-3">
              <BanBannerPreview
                banTypes={banTypes}
                tempBanDays={tempBanDays}
                reason={reason}
                modAlertOnly={modAlertOnly}
                existingBans={bans}
              />
            </div>
          </Col>
        )}

        {/* Ban History Section */}
        {historicalBans.length > 0 && (
          <div className="border-ink-200 rounded border">
            <button
              className="flex w-full items-center justify-between p-3 text-left"
              onClick={() => setShowBanHistory(!showBanHistory)}
            >
              <span className="font-semibold">
                Ban History ({historicalBans.length} record
                {historicalBans.length !== 1 ? 's' : ''})
              </span>
              {showBanHistory ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
            </button>
            {showBanHistory && (
              <div className="border-ink-200 space-y-3 border-t p-3">
                {[...historicalBans].reverse().map((record) => (
                  <BanHistoryRecord
                    key={record.id}
                    record={record}
                    modNames={modNames}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <Row className="gap-2">
          <Button
            color="red"
            disabled={!reason.trim() || (!anyBanSelected && !modAlertOnly)}
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            {modAlertOnly ? 'Send Alert' : 'Apply Ban'}
          </Button>
          <Button color="gray-white" onClick={onClose}>
            Cancel
          </Button>
        </Row>
      </Col>

      {/* Unban Confirmation Modal */}
      <Modal open={unbanModalOpen} setOpen={setUnbanModalOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <Title>Remove Ban</Title>
          <p className="text-ink-700">
            Remove the{' '}
            <strong>
              {unbanBanType === 'posting'
                ? 'Posting'
                : unbanBanType === 'marketControl'
                  ? 'Market Control'
                  : 'Trading'}
            </strong>{' '}
            ban from {user.name}?
          </p>
          <Row className="gap-2">
            <Button
              color="green"
              loading={isSubmitting}
              onClick={handleUnban}
            >
              Remove Ban
            </Button>
            <Button
              color="gray-white"
              onClick={() => setUnbanModalOpen(false)}
            >
              Cancel
            </Button>
          </Row>
        </Col>
      </Modal>

      {/* Remove All Bans Confirmation Modal */}
      <Modal open={removeAllBansModalOpen} setOpen={setRemoveAllBansModalOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <Title>Remove All Bans</Title>
          <p className="text-ink-700">
            Remove all {activeBanTypes.length} bans from {user.name}?
          </p>
          <p className="text-ink-500 text-sm">
            This will remove: {activeBanTypes.join(', ')} bans.
            {isUsernameChangeRestricted && (
              <span className="block mt-1">
                Note: @username change restriction will NOT be removed.
              </span>
            )}
          </p>
          <Row className="gap-2">
            <Button
              color="green"
              loading={isSubmitting}
              onClick={handleRemoveAllBans}
            >
              Remove All Bans
            </Button>
            <Button
              color="gray-white"
              onClick={() => setRemoveAllBansModalOpen(false)}
            >
              Cancel
            </Button>
          </Row>
        </Col>
      </Modal>
    </Modal>
  )
}

function BanTypeToggle({
  label,
  description,
  checked,
  onChange,
  tempDays,
  onTempDaysChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  tempDays?: number
  onTempDaysChange: (days?: number) => void
}) {
  return (
    <div className="border-ink-300 border-l-4 pl-3">
      <Row className="mb-1 items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium">{label}</span>
      </Row>
      <p className="text-ink-600 mb-2 text-sm">{description}</p>
      {checked && (
        <Row className="ml-6 items-center gap-2">
          <span className="text-sm">Temporary ban (days):</span>
          <Input
            type="number"
            min="0"
            placeholder="Permanent"
            value={tempDays || ''}
            onChange={(e) =>
              onTempDaysChange(e.target.value ? parseInt(e.target.value) : undefined)
            }
            className="w-24"
          />
          <span className="text-ink-500 text-sm">
            {tempDays ? `Expires in ${tempDays} days` : 'Permanent ban'}
          </span>
        </Row>
      )}
    </div>
  )
}

function BanBannerPreview({
  banTypes,
  tempBanDays,
  reason,
  modAlertOnly,
  existingBans,
}: {
  banTypes: Record<string, boolean>
  tempBanDays: Record<string, number | undefined>
  reason: string
  modAlertOnly: boolean
  existingBans: UserBan[]
}) {
  const newBans = Object.entries(banTypes).filter(([_, active]) => active)
  const activeBanTypes = getActiveBans(existingBans)
  const existingModAlerts = getActiveModAlerts(existingBans)

  // Get all existing active bans with their details
  const allExistingBans: { type: BanType; reason: string | null; endTime: string | null }[] = []
  for (const banType of activeBanTypes) {
    const ban = getActiveBan(existingBans, banType)
    if (ban) {
      allExistingBans.push({
        type: banType,
        reason: ban.reason,
        endTime: ban.end_time,
      })
    }
  }

  // For non-modAlertOnly mode, filter out bans being overwritten by new ones
  const preservedBans = modAlertOnly
    ? allExistingBans
    : allExistingBans.filter(({ type }) => !banTypes[type])

  const hasNewBans = newBans.length > 0
  const hasExistingBans = allExistingBans.length > 0
  const hasAnyBansToShow = modAlertOnly ? hasExistingBans : (hasNewBans || preservedBans.length > 0)

  // Group reasons for display (matching ban-banner.tsx logic)
  const reasonToBanTypes: Map<string, { banTypes: BanType[]; isNew: boolean }[]> = new Map()

  // Add new bans with the new reason (only if not modAlertOnly)
  if (!modAlertOnly && newBans.length > 0 && reason.trim()) {
    const existing = reasonToBanTypes.get(reason.trim()) || []
    existing.push({ banTypes: newBans.map(([bt]) => bt as BanType), isNew: true })
    reasonToBanTypes.set(reason.trim(), existing)
  }

  // Add preserved/existing bans with their reasons
  const bansToGroup = modAlertOnly ? allExistingBans : preservedBans
  for (const { type, reason: existingReason } of bansToGroup) {
    if (existingReason) {
      const existing = reasonToBanTypes.get(existingReason) || []
      const found = existing.find(e => !e.isNew)
      if (found) {
        found.banTypes.push(type)
      } else {
        existing.push({ banTypes: [type], isNew: false })
      }
      reasonToBanTypes.set(existingReason, existing)
    }
  }

  const groupedReasons = Array.from(reasonToBanTypes.entries()).map(
    ([reasonText, groups]) => ({ reason: reasonText, groups })
  )

  return (
    <Col className="gap-3">
      {/* Ban section - matches ban-banner.tsx styling */}
      {hasAnyBansToShow && (
        <div className="rounded border-2 border-red-500 bg-red-100 p-4">
          <Col className="gap-2">
            <h3 className="font-bold text-red-900">Account Restricted</h3>
            <p className="text-red-800">You have been restricted from:</p>
            <ul className="list-inside list-disc space-y-1 text-red-800">
              {!modAlertOnly && newBans.map(([banType]) => (
                <li key={banType}>
                  <strong>
                    {getBanTypeDisplayName(banType as BanType)} ({getBanTypeDescription(banType as BanType)})
                  </strong>
                  {tempBanDays[banType] ? (
                    <span className="text-sm">
                      {' '}- Expires in {tempBanDays[banType]} days
                    </span>
                  ) : (
                    <span className="text-sm"> - Permanent</span>
                  )}
                  <span className="ml-1 text-xs text-red-600">(new)</span>
                </li>
              ))}
              {(modAlertOnly ? allExistingBans : preservedBans).map(({ type, endTime }) => (
                <li key={type}>
                  <strong>
                    {getBanTypeDisplayName(type)} ({getBanTypeDescription(type)})
                  </strong>
                  {endTime ? (
                    <span className="text-sm">
                      {' '}- Expires in {formatBanTimeRemaining(new Date(endTime).getTime() - Date.now())}
                    </span>
                  ) : (
                    <span className="text-sm"> - Permanent</span>
                  )}
                  {!modAlertOnly && <span className="ml-1 text-xs text-gray-500">(existing)</span>}
                </li>
              ))}
            </ul>
            {groupedReasons.length > 0 && (
              <div className="border-ink-200 mt-2 rounded border bg-white p-3">
                <p className="font-semibold text-red-900">
                  {groupedReasons.length === 1 ? 'Reason:' : 'Reasons:'}
                </p>
                {groupedReasons.map(({ reason: reasonText, groups }) => (
                  <div key={reasonText}>
                    {groups.map((group, idx) => (
                      <p key={idx} className="text-red-800">
                        {groupedReasons.length > 1 && (
                          <span className="font-medium">
                            {group.banTypes.map((bt) => getBanTypeDisplayName(bt)).join(' + ')}:{' '}
                          </span>
                        )}
                        {reasonText}
                        {!modAlertOnly && group.isNew && <span className="ml-1 text-xs text-red-600">(new)</span>}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Col>
        </div>
      )}

      {/* Existing mod alerts - shown first so mod can see what's already there */}
      {existingModAlerts.map((alert) => (
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
              className="ml-2 text-xl text-yellow-700 opacity-50 cursor-not-allowed"
              title="User can dismiss"
              disabled
            >
              ×
            </button>
          </Row>
          <p className="mt-1 text-xs text-yellow-700">(existing alert)</p>
        </div>
      ))}

      {/* New mod alert being added */}
      {modAlertOnly && reason.trim() && (
        <div className="rounded border-2 border-yellow-500 bg-yellow-100 p-4">
          <Row className="items-start justify-between">
            <Col className="flex-1 gap-2">
              <h3 className="font-bold text-yellow-900">Moderator Alert</h3>
              <div className="border-ink-200 rounded border bg-white p-3">
                <p className="text-yellow-900">{reason}</p>
              </div>
            </Col>
            <button
              className="ml-2 text-xl text-yellow-700 opacity-50 cursor-not-allowed"
              title="User can dismiss"
              disabled
            >
              ×
            </button>
          </Row>
          <p className="mt-1 text-xs text-yellow-700">(new alert)</p>
        </div>
      )}
    </Col>
  )
}

function getBanTypeLabel(banType: BanType): string {
  const labels: Record<BanType, string> = {
    posting: 'Posting (commenting, messaging, creating posts)',
    marketControl: 'Market Control (creating, editing, resolving markets, hiding comments)',
    trading: 'Trading (betting, managrams, liquidity)',
    modAlert: 'Mod Alert (warning message)',
  }
  return labels[banType]
}

function BanHistoryRecord({
  record,
  modNames,
}: {
  record: UserBan
  modNames: Record<string, string>
}) {
  const bannedByName = record.created_by
    ? modNames[record.created_by] || record.created_by
    : 'Unknown'
  const unbannedByName =
    record.ended_by === 'system'
      ? 'System (auto-expired)'
      : record.ended_by
        ? modNames[record.ended_by] || record.ended_by
        : 'Unknown'

  return (
    <div className="bg-canvas-50 rounded border p-2">
      <Row className="items-center justify-between">
        <span className="font-medium">
          {record.ban_type === 'posting'
            ? 'Posting Ban'
            : record.ban_type === 'marketControl'
              ? 'Market Control Ban'
              : 'Trading Ban'}
        </span>
        <span className="text-ink-500 text-xs">
          {record.end_time ? 'Temporary' : 'Permanent'}
        </span>
      </Row>
      <div className="text-ink-600 mt-1 space-y-1 text-xs">
        <p>
          <strong>Banned:</strong>{' '}
          {new Date(record.created_at).toLocaleDateString()} by @{bannedByName}
        </p>
        <p>
          <strong>Reason:</strong> {record.reason || 'No reason provided'}
        </p>
        {record.ended_at && (
          <p>
            <strong>Unbanned:</strong>{' '}
            {new Date(record.ended_at).toLocaleDateString()} by {unbannedByName}
          </p>
        )}
      </div>
    </div>
  )
}
