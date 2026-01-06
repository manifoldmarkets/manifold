import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/outline'
import { User, UnbanRecord } from 'common/user'
import {
  BanType,
  formatBanTimeRemaining,
  getActiveBans,
  getBanTimeRemaining,
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
  isOpen,
  onClose,
}: {
  user: User
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
  const [unbanNote, setUnbanNote] = useState('')

  // Remove all bans modal state
  const [removeAllBansModalOpen, setRemoveAllBansModalOpen] = useState(false)
  const [removeAllBansNote, setRemoveAllBansNote] = useState('')

  // Username change restriction - default to true (restrict) when any ban is selected
  // undefined means use default behavior (restrict when banning)
  const [allowUsernameChange, setAllowUsernameChange] = useState<boolean | undefined>(undefined)

  // Fetch mod names for current bans
  const activeBans = getActiveBans(user)
  const isUsernameChangeRestricted = user.canChangeUsername === false
  const hasCurrentBansOrAlerts =
    activeBans.length > 0 ||
    (user.modAlert && !user.modAlert.dismissed) ||
    isUsernameChangeRestricted

  useEffect(() => {
    const modIds = new Set<string>()

    // Collect mod IDs from bans
    if (user.bans?.posting?.bannedBy) modIds.add(user.bans.posting.bannedBy)
    if (user.bans?.marketControl?.bannedBy)
      modIds.add(user.bans.marketControl.bannedBy)
    if (user.bans?.trading?.bannedBy) modIds.add(user.bans.trading.bannedBy)
    if (user.modAlert?.createdBy) modIds.add(user.modAlert.createdBy)

    // Collect mod IDs from ban history
    if (user.banHistory) {
      for (const record of user.banHistory) {
        if (record.bannedBy) modIds.add(record.bannedBy)
        if (record.unbannedBy && record.unbannedBy !== 'system')
          modIds.add(record.unbannedBy)
      }
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
  }, [user])

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

      // Only send ban types that are being added (true), not the ones left unchecked
      // This allows ban stacking - existing bans are preserved when adding new ones
      const bansToSend: Record<string, boolean> = {}
      if (banTypes.posting) bansToSend.posting = true
      if (banTypes.marketControl) bansToSend.marketControl = true
      if (banTypes.trading) bansToSend.trading = true

      await api('ban-user', {
        userId: user.id,
        bans: modAlertOnly ? undefined : (Object.keys(bansToSend).length > 0 ? bansToSend : undefined),
        unbanTimes: modAlertOnly ? undefined : unbanTimes,
        reason: reason.trim(),
        // Only send mod alert when "mod alert only" is checked, not when banning
        modAlert: modAlertOnly ? { message: reason.trim() } : undefined,
        // Username change restriction - only send when not mod alert only
        allowUsernameChange: modAlertOnly ? undefined : allowUsernameChange,
      })

      toast.success(modAlertOnly ? 'Mod alert sent' : 'Ban updated successfully')
      onClose()
      // Reload page to refresh user data
      window.location.reload()
    } catch (error) {
      toast.error('Failed to update ban: ' + (error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openUnbanModal = (banType: BanType) => {
    setUnbanBanType(banType)
    setUnbanNote('')
    setUnbanModalOpen(true)
  }

  const handleUnban = async () => {
    if (!unbanBanType) return
    setIsSubmitting(true)
    try {
      await api('ban-user', {
        userId: user.id,
        bans: { [unbanBanType]: false },
        unbanNote: unbanNote.trim() || undefined,
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

  const handleClearAlert = async () => {
    setIsSubmitting(true)
    try {
      await api('dismiss-mod-alert', {})
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
        unbanNote: removeAllBansNote.trim() || undefined,
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
                  Current Bans/Alerts ({activeBans.length} ban
                  {activeBans.length !== 1 ? 's' : ''}
                  {user.modAlert && !user.modAlert.dismissed ? ', 1 alert' : ''})
                </span>
                {showCurrentBans ? (
                  <ChevronUpIcon className="h-5 w-5 shrink-0" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5 shrink-0" />
                )}
              </button>
              {activeBans.length >= 1 && (
                <Button
                  color="red-outline"
                  size="2xs"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRemoveAllBansNote('')
                    setRemoveAllBansModalOpen(true)
                  }}
                >
                  Remove All
                </Button>
              )}
            </div>
            {showCurrentBans && (
              <div className="border-ink-200 space-y-3 border-t p-3">
                {activeBans.map((banType) => {
                  const ban = user.bans?.[banType]
                  if (!ban) return null
                  const timeRemaining = getBanTimeRemaining(user, banType)
                  const modName = ban.bannedBy
                    ? modNames[ban.bannedBy] || ban.bannedBy
                    : 'Unknown'
                  return (
                    <div
                      key={banType}
                      className="rounded border border-red-300 bg-red-50 p-2"
                    >
                      <Row className="items-center justify-between">
                        <span className="font-medium text-red-900">
                          {banType === 'posting'
                            ? 'Posting Ban'
                            : banType === 'marketControl'
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
                            onClick={() => openUnbanModal(banType)}
                          >
                            Remove
                          </Button>
                        </Row>
                      </Row>
                      <p className="mt-1 text-sm text-red-800">
                        Reason: {ban.reason}
                      </p>
                      <p className="text-ink-500 mt-1 text-xs">
                        Banned by: @{modName} on{' '}
                        {new Date(ban.bannedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )
                })}
                {user.modAlert && !user.modAlert.dismissed && (
                  <div className="rounded border border-yellow-300 bg-yellow-50 p-2">
                    <Row className="items-center justify-between">
                      <span className="font-medium text-yellow-900">
                        Active Mod Alert
                      </span>
                      <Button
                        color="gray-outline"
                        size="2xs"
                        loading={isSubmitting}
                        onClick={handleClearAlert}
                      >
                        Clear
                      </Button>
                    </Row>
                    <p className="mt-1 text-sm text-yellow-800">
                      Message: {user.modAlert.message}
                    </p>
                    <p className="text-ink-500 mt-1 text-xs">
                      Sent by: @
                      {user.modAlert.createdBy
                        ? modNames[user.modAlert.createdBy] ||
                          user.modAlert.createdBy
                        : 'Unknown'}{' '}
                      on {new Date(user.modAlert.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
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

            {/* Username Change Restriction Notice - only show if not already restricted */}
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
          <div className="rounded border-2 border-red-500 bg-red-50 p-4">
            <h4 className="mb-2 font-semibold text-red-900">
              Preview (User will see):
            </h4>
            <BanBannerPreview
              banTypes={banTypes}
              tempBanDays={tempBanDays}
              reason={reason}
              modAlertOnly={modAlertOnly}
              existingBans={user.bans}
            />
          </div>
        )}

        {/* Ban History Section */}
        {user.banHistory && user.banHistory.length > 0 && (
          <div className="border-ink-200 rounded border">
            <button
              className="flex w-full items-center justify-between p-3 text-left"
              onClick={() => setShowBanHistory(!showBanHistory)}
            >
              <span className="font-semibold">
                Ban History ({user.banHistory.length} record
                {user.banHistory.length !== 1 ? 's' : ''})
              </span>
              {showBanHistory ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
            </button>
            {showBanHistory && (
              <div className="border-ink-200 space-y-3 border-t p-3">
                {[...user.banHistory].reverse().map((record, idx) => (
                  <BanHistoryRecord
                    key={idx}
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
          <Col className="gap-2">
            <label className="text-ink-700 text-sm font-medium">
              Mod Note (optional, not shown to user)
            </label>
            <textarea
              value={unbanNote}
              onChange={(e) => setUnbanNote(e.target.value)}
              placeholder="Write a note for future reference..."
              className="border-ink-300 min-h-[80px] rounded border p-2 text-sm"
            />
          </Col>
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
            Remove all {activeBans.length} bans from {user.name}?
          </p>
          <p className="text-ink-500 text-sm">
            This will remove: {activeBans.join(', ')} bans.
            {isUsernameChangeRestricted && (
              <span className="block mt-1">
                Note: @username change restriction will NOT be removed.
              </span>
            )}
          </p>
          <Col className="gap-2">
            <label className="text-ink-700 text-sm font-medium">
              Mod Note (optional, not shown to user)
            </label>
            <textarea
              value={removeAllBansNote}
              onChange={(e) => setRemoveAllBansNote(e.target.value)}
              placeholder="Write a note for future reference..."
              className="border-ink-300 min-h-[80px] rounded border p-2 text-sm"
            />
          </Col>
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
  existingBans?: {
    posting?: { reason: string; unbanTime?: number }
    marketControl?: { reason: string; unbanTime?: number }
    trading?: { reason: string; unbanTime?: number }
  }
}) {
  const newBans = Object.entries(banTypes).filter(([_, active]) => active)

  // Get existing bans that aren't being overwritten by new bans
  const preservedBans: { type: BanType; reason: string; unbanTime?: number }[] = []
  if (existingBans) {
    for (const banType of ['posting', 'marketControl', 'trading'] as BanType[]) {
      const existingBan = existingBans[banType]
      // Only show if there's an existing ban AND we're not adding a new ban of this type
      if (existingBan && !banTypes[banType]) {
        // Check if ban is still active (not expired)
        if (!existingBan.unbanTime || existingBan.unbanTime > Date.now()) {
          preservedBans.push({
            type: banType,
            reason: existingBan.reason,
            unbanTime: existingBan.unbanTime,
          })
        }
      }
    }
  }

  const hasAnyBans = newBans.length > 0 || preservedBans.length > 0

  return (
    <div className="rounded bg-white p-3">
      <h3 className="mb-2 font-bold text-red-900">
        {modAlertOnly ? '⚠️ Moderator Alert' : '⛔ Account Restricted'}
      </h3>

      {!modAlertOnly && hasAnyBans && (
        <>
          <p className="mb-2 text-red-800">
            You have been restricted from:
          </p>
          <ul className="mb-3 list-inside list-disc space-y-1 text-red-800">
            {/* Show new bans being added */}
            {newBans.map(([banType]) => (
              <li key={banType}>
                <strong>{getBanTypeLabel(banType as BanType)}</strong>
                {tempBanDays[banType] && (
                  <span className="text-sm">
                    {' '}
                    — Expires in {tempBanDays[banType]} days
                  </span>
                )}
                {!tempBanDays[banType] && (
                  <span className="text-sm"> — Permanent</span>
                )}
                <span className="ml-1 text-xs text-red-600">(new)</span>
              </li>
            ))}
            {/* Show existing bans that will be preserved */}
            {preservedBans.map(({ type, unbanTime }) => (
              <li key={type} className="text-red-700">
                <strong>{getBanTypeLabel(type)}</strong>
                {unbanTime && (
                  <span className="text-sm">
                    {' '}
                    — Expires in {formatBanTimeRemaining(unbanTime - Date.now())}
                  </span>
                )}
                {!unbanTime && (
                  <span className="text-sm"> — Permanent</span>
                )}
                <span className="ml-1 text-xs text-gray-500">(existing)</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Show new reason */}
      <div className="border-ink-200 rounded border bg-red-50 p-2">
        <p className="mb-1 font-semibold text-red-900">Reason:</p>
        <p className="text-red-800">{reason}</p>
      </div>

      {/* Show existing ban reasons if any are preserved */}
      {preservedBans.length > 0 && (
        <div className="border-ink-200 mt-2 rounded border bg-orange-50 p-2">
          <p className="mb-1 font-semibold text-orange-900">Previous reason(s):</p>
          {preservedBans.map(({ type, reason: existingReason }) => (
            <p key={type} className="text-orange-800 text-sm">
              <span className="font-medium">{getBanTypeLabel(type).split(' (')[0]}:</span> {existingReason}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function getBanTypeLabel(banType: BanType): string {
  const labels: Record<BanType, string> = {
    posting: 'Posting (commenting, messaging, creating posts)',
    marketControl: 'Market Control (creating, editing, resolving markets, hiding comments)',
    trading: 'Trading (betting, managrams, liquidity)',
  }
  return labels[banType]
}

function getHistoryBanTypeDisplayName(banType: string): string {
  // Handle combined ban types like "posting+trading+marketControl"
  if (banType.includes('+')) {
    const types = banType.split('+')
    const names = types.map((t) => {
      if (t === 'posting') return 'Posting'
      if (t === 'marketControl') return 'Market Control'
      if (t === 'trading') return 'Trading'
      return t
    })
    return names.join(' + ') + ' Bans'
  }

  if (banType === 'posting') return 'Posting Ban'
  if (banType === 'marketControl') return 'Market Control Ban'
  if (banType === 'trading') return 'Trading Ban'
  if (banType === 'usernameChange') return '@username Changes'
  return banType
}

function BanHistoryRecord({
  record,
  modNames,
}: {
  record: UnbanRecord
  modNames: Record<string, string>
}) {
  const bannedByName = modNames[record.bannedBy] || record.bannedBy
  const unbannedByName =
    record.unbannedBy === 'system'
      ? 'System (auto-expired)'
      : modNames[record.unbannedBy] || record.unbannedBy

  const isUsernameChangeRecord = record.banType === 'usernameChange'
  const isCombinedRecord = record.banType.includes('+')

  return (
    <div className="bg-canvas-50 rounded border p-2">
      <Row className="items-center justify-between">
        <span className="font-medium">
          {getHistoryBanTypeDisplayName(record.banType)}
        </span>
        {!isUsernameChangeRecord && !isCombinedRecord && (
          <span className="text-ink-500 text-xs">
            {record.wasTemporary ? 'Temporary' : 'Permanent'}
          </span>
        )}
        {isCombinedRecord && (
          <span className="text-ink-500 text-xs">Bulk removal</span>
        )}
      </Row>
      <div className="text-ink-600 mt-1 space-y-1 text-xs">
        {isUsernameChangeRecord ? (
          <>
            <p>
              <strong>Re-enabled:</strong>{' '}
              {new Date(record.unbannedAt).toLocaleDateString()} by {unbannedByName}
            </p>
            {record.unbanNote && (
              <p className="text-ink-500 italic">
                <strong>Mod note:</strong> {record.unbanNote}
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              <strong>Banned:</strong>{' '}
              {new Date(record.bannedAt).toLocaleDateString()} by @{bannedByName}
            </p>
            <p>
              <strong>Reason:</strong> {record.banReason}
            </p>
            <p>
              <strong>Unbanned:</strong>{' '}
              {new Date(record.unbannedAt).toLocaleDateString()} by {unbannedByName}
            </p>
            {record.unbanNote && (
              <p className="text-ink-500 italic">
                <strong>Mod note:</strong> {record.unbanNote}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
