import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { SHOP_ITEMS, getShopItem, isPurchaseActive } from 'common/shop/items'
import { Card } from 'web/components/widgets/card'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { User } from 'common/user'
import { ShopItem } from 'common/shop/items'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { Modal } from 'web/components/layout/modal'
import { Avatar } from 'web/components/widgets/avatar'
import { Tooltip } from 'web/components/widgets/tooltip'
import { FaStar } from 'react-icons/fa'
import { FaGem } from 'react-icons/fa6'
import { LuCrown, LuGraduationCap } from 'react-icons/lu'
import Link from 'next/link'

export default function ShopPage() {
  const user = useUser()

  // Get user's active purchases
  const ownedItemIds = new Set(
    user?.shopPurchases
      ?.filter((p) => isPurchaseActive(p))
      .map((p) => p.itemId) ?? []
  )

  return (
    <Page trackPageView="shop page" className="p-3">
      <SEO
        title="Shop"
        description="Spend your mana on digital goods"
        url="/shop"
      />
      <Col className="mx-auto max-w-xl">
        <Row className="mb-2 items-center gap-2 text-2xl font-semibold">
          <FaGem className="h-6 w-6 text-violet-500" />
          Cosmetics
        </Row>
        {user && (
          <Row className="text-ink-700 mb-4 items-center gap-4 text-sm">
            <span>
              Your balance:{' '}
              <span className="font-semibold text-teal-600">
                {formatMoney(user.balance)}
              </span>
            </span>
            <Link
              href="/checkout"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Add more →
            </Link>
          </Row>
        )}

        {/* User's active items section */}
        {user && ownedItemIds.size > 0 && (
          <OwnedItemsSection user={user} />
        )}

        {/* Available items */}
        <div className="grid grid-cols-2 gap-4">
          {SHOP_ITEMS.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
              user={user}
              owned={ownedItemIds.has(item.id)}
            />
          ))}
        </div>
      </Col>
    </Page>
  )
}

function OwnedItemsSection(props: { user: User }) {
  const { user } = props
  const activePurchases = user.shopPurchases?.filter((p) => isPurchaseActive(p)) ?? []

  if (activePurchases.length === 0) return null

  const handleToggle = async (itemId: string, currentEnabled: boolean) => {
    try {
      await api('shop-toggle', { itemId, enabled: !currentEnabled })
      toast.success(currentEnabled ? 'Item disabled' : 'Item enabled')
      // The user object will be refreshed automatically via useUser
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle item')
    }
  }

  return (
    <Col className="mb-6 gap-2">
      <div className="text-ink-800 text-lg font-semibold">Your Items</div>
      <div className="grid grid-cols-2 gap-2">
        {activePurchases.map((purchase) => {
          const item = getShopItem(purchase.itemId)
          if (!item) return null

          const isEnabled = purchase.enabled !== false

          return (
            <Card key={purchase.txnId} className="p-3">
              <Row className="items-center justify-between">
                <div className="font-medium">{item.name}</div>
                {purchase.expiresAt && (
                  <div className="text-ink-500 text-sm">
                    Expires {new Date(purchase.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </Row>
              {(item.type === 'permanent-toggleable' || item.type === 'time-limited') && (
                <Row className="mt-2">
                  <Button
                    size="xs"
                    color={isEnabled ? 'indigo' : 'gray'}
                    onClick={() => handleToggle(purchase.itemId, isEnabled)}
                  >
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </Row>
              )}
            </Card>
          )
        })}
      </div>
    </Col>
  )
}

// Preview components for each shop item type - now with user data
function SupporterBadgePreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const avatarUrl = user?.avatarUrl

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <Row className="items-center gap-2">
        <Avatar
          username={user?.username}
          avatarUrl={avatarUrl}
          size="sm"
          noLink
        />
        <span className="font-medium">{displayName}</span>
        <Tooltip text="Manifold Supporter" placement="right">
          <FaStar className="h-4 w-4 text-amber-500" />
        </Tooltip>
      </Row>
    </div>
  )
}

function GoldenBorderPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const avatarUrl = user?.avatarUrl

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <div className="relative">
        <div className="absolute -inset-1 animate-pulse rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 opacity-75 blur-sm" />
        <Avatar
          username={user?.username}
          avatarUrl={avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-amber-400"
        />
      </div>
    </div>
  )
}

function CrownPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const avatarUrl = user?.avatarUrl

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <LuCrown className="h-5 w-5 text-amber-500" />
        </div>
      </div>
    </div>
  )
}

function GraduationCapPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const avatarUrl = user?.avatarUrl

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <LuGraduationCap className="h-5 w-5 text-indigo-500" />
        </div>
      </div>
    </div>
  )
}

function StreakFreezePreview(props: { user: User | null | undefined }) {
  const { user } = props
  const currentFreezes = user?.streakForgiveness ?? 0

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <Row className="items-center gap-2">
        <span className="text-ink-600 text-sm">Your freezes:</span>
        <span className="text-lg">❄️</span>
        <span className="font-bold text-blue-500">{currentFreezes}</span>
        <span className="text-ink-500">→</span>
        <span className="font-bold text-blue-500">{currentFreezes + 1}</span>
      </Row>
    </div>
  )
}

function PampuSkinPreview() {
  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4">
      <Col className="items-center gap-2">
        <span className="text-ink-500 text-xs">Your YES button becomes:</span>
        <Row className="items-center gap-2">
          <Button color="green-outline" size="sm">
            PAMPU
          </Button>
          <Button color="red-outline" size="sm" disabled>
            No
          </Button>
        </Row>
      </Col>
    </div>
  )
}

function HovercardGlowPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2">
      <div className="bg-canvas-0 w-44 scale-[0.85] origin-center divide-y divide-ink-300 rounded-md ring-2 ring-violet-400 shadow-[0_0_15px_rgba(167,139,250,0.5)]">
        <div className="px-3 py-2">
          <Row className="items-start justify-between">
            <Avatar
              username={user?.username}
              avatarUrl={user?.avatarUrl}
              size="md"
              noLink
            />
            <div className="bg-primary-500 rounded px-2 py-0.5 text-[10px] text-white">
              Follow
            </div>
          </Row>
          <div className="mt-1 text-sm font-bold truncate">{displayName}</div>
          <div className="text-ink-500 text-xs">@{username}</div>
          <Row className="mt-1 gap-3 text-[10px]">
            <span><b>0</b> Following</span>
            <span><b>0</b> Followers</span>
          </Row>
        </div>
        <div className="px-3 py-1.5 text-[10px] text-ink-600">
          <b>Last active:</b> today
        </div>
      </div>
    </div>
  )
}

function ItemPreview(props: { itemId: string; user: User | null | undefined }) {
  const { itemId, user } = props

  switch (itemId) {
    case 'supporter-badge-30d':
    case 'supporter-badge-1y':
      return <SupporterBadgePreview user={user} />
    case 'avatar-golden-border':
      return <GoldenBorderPreview user={user} />
    case 'avatar-crown':
      return <CrownPreview user={user} />
    case 'avatar-graduation-cap':
      return <GraduationCapPreview user={user} />
    case 'streak-forgiveness':
      return <StreakFreezePreview user={user} />
    case 'pampu-skin':
      return <PampuSkinPreview />
    case 'hovercard-glow':
      return <HovercardGlowPreview user={user} />
    default:
      return null
  }
}

function ShopItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  owned: boolean
}) {
  const { item, user, owned } = props
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)

  const canPurchase = user && user.balance >= item.price
  const isOneTimePurchased = item.limit === 'one-time' && owned

  const handlePurchase = async () => {
    if (!user) return

    setPurchasing(true)
    try {
      await api('shop-purchase', { itemId: item.id })
      toast.success(`Purchased ${item.name}!`)
      setShowConfirmModal(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to purchase item')
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-3 p-4">
        <div className="text-lg font-semibold">{item.name}</div>
        <p className="text-ink-600 text-sm">{item.description}</p>

        {/* Live Preview with actual user data */}
        <ItemPreview itemId={item.id} user={user} />

        <Row className="mt-auto items-center justify-between pt-2">
          <div className="font-semibold text-teal-600">
            {formatMoney(item.price)}
          </div>

          {isOneTimePurchased ? (
            <div className="text-ink-500 text-sm">Owned</div>
          ) : !canPurchase && user ? (
            <Link href="/checkout">
              <Button size="sm" color="gradient-pink">
                Buy mana
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              color="indigo"
              disabled={!user}
              onClick={() => setShowConfirmModal(true)}
            >
              Buy
            </Button>
          )}
        </Row>

        {item.duration && (
          <div className="text-ink-500 text-xs">
            Duration: {Math.round(item.duration / (24 * 60 * 60 * 1000))} days
          </div>
        )}
      </Card>

      <Modal open={showConfirmModal} setOpen={setShowConfirmModal}>
        <Col className="bg-canvas-0 rounded-md p-6 gap-4">
          <div className="text-lg font-semibold">Confirm Purchase</div>
          <p className="text-ink-600">
            Are you sure you want to purchase <strong>{item.name}</strong> for{' '}
            <span className="font-semibold text-teal-600">{formatMoney(item.price)}</span>?
          </p>

          {/* Preview in modal too with actual user data */}
          <ItemPreview itemId={item.id} user={user} />

          {item.duration && (
            <p className="text-ink-500 text-sm">
              This item will expire after {Math.round(item.duration / (24 * 60 * 60 * 1000))} days.
            </p>
          )}
          <Row className="gap-2 justify-end">
            <Button color="gray" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              color="indigo"
              loading={purchasing}
              onClick={handlePurchase}
            >
              Purchase
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
