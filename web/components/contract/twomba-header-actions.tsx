import {
  EyeIcon,
  EyeOffIcon,
  InformationCircleIcon,
} from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { CgBlock, CgUnblock } from 'react-icons/cg'
import { FaDroplet } from 'react-icons/fa6'
import { IoDuplicate, IoRocket } from 'react-icons/io5'
import { MdOutlineReport } from 'react-icons/md'
import { TiVolumeMute } from 'react-icons/ti'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { RepostModal } from 'web/components/comments/repost-modal'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api, updateUserDisinterestEmbedding } from 'web/lib/api/api'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { duplicateContractHref } from '../buttons/duplicate-contract-button'
import { followMarket, unfollowMarket } from '../buttons/follow-market-button'
import { ReportModal } from '../buttons/report-button'
import DropdownMenu from '../comments/dropdown-menu'
import { Row } from '../layout/row'
import { TwombaToggle } from '../twomba/twomba-toggle'
import { getLinkTarget } from '../widgets/linkify'
import { BoostDialog } from './boost-button'
import { AddLiquidityModal } from './subsidize-button'
import { TwombaContractInfoDialog } from './twomba-contract-info-dialog'
import { WatchMarketModal } from './watch-market-modal'
import { ChangeBannerButton } from './change-banner-button'
import { isAdminId } from 'common/envs/constants'
import { FaDollarSign } from 'react-icons/fa'
import { ToggleVerifyCallout } from '../twomba/toggle-verify-callout'
import router from 'next/router'

export function TwombaHeaderActions(props: {
  playContract: Contract
  currentContract: Contract
}) {
  const { playContract, currentContract } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isCreator = user?.id === playContract.creatorId
  const isAdmin = user ? isAdminId(user.id) : false

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [repostOpen, setRepostOpen] = useState(false)
  const [boostOpen, setBoostOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [liquidityOpen, setLiquidityOpen] = useState(false)

  const duplicateHref = duplicateContractHref(playContract)

  const isBlocked =
    privateUser && privateUser.blockedContractIds?.includes(playContract.id)

  const onBlock = async () => {
    await toast.promise(
      api('market/:contractId/block', { contractId: playContract.id }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see this question in your feed nor search.`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await api('market/:contractId/unblock', { contractId: playContract.id })
  }

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: playContract.id,
      creatorId: playContract.creatorId,
    })
    toast(`We won't show you content like that again`, {
      icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
    })
  }

  const contractOpenAndPublic =
    !currentContract.isResolved &&
    (currentContract.closeTime ?? Infinity) > Date.now() &&
    currentContract.visibility == 'public'

  const addLiquidityEnabled =
    user &&
    (currentContract.mechanism == 'cpmm-1' ||
      currentContract.mechanism == 'cpmm-multi-1') &&
    contractOpenAndPublic

  const [following, setFollowing] = useState<boolean>()
  const [followingOpen, setFollowingOpen] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    db.from('contract_follows')
      .select('contract_id')
      .eq('follow_id', user.id)
      .eq('contract_id', currentContract.id)
      .then((res) => {
        setFollowing((res.data?.length ?? 0) > 0)
      })
  }, [user?.id, followingOpen])

  const convertToCashMarket = async () => {
    try {
      await api('create-cash-contract', {
        manaContractId: currentContract.id,
        subsidyAmount: 100, // You may want to make this configurable
      })
      toast.success('Market converted to cash market successfully')
      router.reload()
    } catch (error) {
      toast.error('Failed to convert market to cash market')
      console.error(error)
    }
  }

  const dropdownItems = [
    ...(user
      ? [
          {
            name: following ? 'Unwatch' : 'Watch',
            onClick: async () => {
              if (following) {
                await unfollowMarket(playContract.id, playContract.slug)
                setFollowing(false)
              } else {
                await followMarket(playContract.id, playContract.slug)
                setFollowing(true)
              }
              if (!user.hasSeenContractFollowModal) {
                await api('me/update', { hasSeenContractFollowModal: true })
                setFollowingOpen(true)
              }
            },
            icon: following ? (
              <EyeOffIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            ),
          },
          {
            name: 'Repost',
            onClick: () => {
              setRepostOpen(true)
            },
            icon: <BiRepost className="h-5 w-5" />,
          },
        ]
      : []),
    ...(user && contractOpenAndPublic
      ? [
          {
            name: 'Boost',
            onClick: () => {
              setBoostOpen(true)
            },
            icon: <IoRocket className="h-5 w-5" />,
          },
        ]
      : []),
    ...(addLiquidityEnabled
      ? [
          {
            name: 'Add Liquidity',
            onClick: () => {
              setLiquidityOpen(true)
            },
            icon: <FaDroplet className="h-5 w-5" />,
          },
        ]
      : []),
    ...(user
      ? [
          {
            name: 'Duplicate',
            isLink: true,
            onClick: () => {
              trackCallback('duplicate market')
            },
            linkProps: {
              href: duplicateHref,
              target: getLinkTarget(duplicateHref, true),
            },
            icon: <IoDuplicate className="h-5 w-5" />,
          },
        ]
      : []),
    {
      name: 'See info',
      onClick: () => setDetailsOpen(true),
      icon: <InformationCircleIcon className="h-5 w-5" />,
    },
    {
      name: 'line',
      nonButtonContent: <div className="bg-ink-400 mx-4 my-2 h-[1px]" />,
    },
    ...(user && !isCreator
      ? [
          {
            name: 'Report',
            onClick: () => {
              setReportOpen(true)
            },
            icon: <MdOutlineReport className="h-5 w-5" />,
            className:
              'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-ink-100',
          },
          {
            name: 'Uninterested',
            onClick: markUninteresting,
            icon: <TiVolumeMute className="h-5 w-5" />,
            className:
              'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-ink-100',
          },
        ]
      : []),
    ...(privateUser && !isCreator
      ? [
          {
            name: isBlocked ? 'Unblock' : 'Block',
            onClick: isBlocked
              ? withTracking(onUnblock, 'unblock')
              : withTracking(onBlock, 'block'),
            icon: isBlocked ? (
              <CgUnblock className="h-5 w-5" />
            ) : (
              <CgBlock className="h-5 w-5" />
            ),
            className: isBlocked
              ? ''
              : 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-ink-100',
          },
        ]
      : []),
    ...(isAdmin && !playContract.siblingContractId
      ? [
          {
            name: 'Sweepify!',
            onClick: convertToCashMarket,
            icon: <FaDollarSign className="h-4 w-4" />,
            className:
              'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-ink-100',
          },
        ]
      : []),
  ]

  return (
    // make tooltip children stretch
    <Row className="mr-4 shrink-0 items-center [&>*]:flex">
      {!!currentContract.siblingContractId && (
        <div className="relative">
          <TwombaToggle />
          <ToggleVerifyCallout
            className="absolute -right-[60px] top-full z-10 mt-3 hidden w-80 sm:flex"
            caratClassName="right-[84px]"
          />
        </div>
      )}
      {!playContract.coverImageUrl && isCreator && (
        <ChangeBannerButton
          contract={playContract}
          className="ml-3 first:ml-0"
        />
      )}
      <CopyLinkOrShareButton
        url={getShareUrl(currentContract, user?.username)}
        tooltip="Copy question share link"
        className="text-ink-500 hover:text-ink-600"
        size="xs"
        eventTrackingName="copy market link"
        trackingInfo={{ contractId: currentContract.id }}
      />

      <DropdownMenu items={dropdownItems} />
      <TwombaContractInfoDialog
        playContract={playContract}
        statsContract={currentContract}
        user={user}
        open={detailsOpen}
        setOpen={setDetailsOpen}
      />
      {repostOpen && (
        <RepostModal
          contract={currentContract}
          open={repostOpen}
          setOpen={setRepostOpen}
        />
      )}
      <BoostDialog
        contract={currentContract}
        isOpen={boostOpen}
        setOpen={setBoostOpen}
      />
      {addLiquidityEnabled && (
        <AddLiquidityModal
          contract={currentContract}
          isOpen={liquidityOpen}
          setOpen={setLiquidityOpen}
        />
      )}
      <ReportModal
        isModalOpen={reportOpen}
        label={'contract'}
        setIsModalOpen={setReportOpen}
        report={{
          contentId: playContract.id,
          contentType: 'contract',
          contentOwnerId: playContract.creatorId,
        }}
      />
      <WatchMarketModal
        open={followingOpen}
        setOpen={setFollowingOpen}
        title={`You ${following ? 'watched' : 'unwatched'} a question!`}
      />
    </Row>
  )
}
