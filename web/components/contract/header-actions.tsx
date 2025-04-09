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
import { IoDuplicate } from 'react-icons/io5'
import { MdOutlineReport } from 'react-icons/md'
import { TiVolumeMute } from 'react-icons/ti'
import { MenuSeparator } from '@headlessui/react'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { RepostModal } from 'web/components/comments/repost-modal'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api, updateUserDisinterestEmbedding } from 'web/lib/api/api'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { duplicateContractHref } from '../buttons/duplicate-contract-button'
import {
  followMarket,
  FollowMarketIconButton,
  unfollowMarket,
} from '../buttons/follow-market-button'
import { ReportModal } from '../buttons/report-button'
import DropdownMenu from '../widgets/dropdown-menu'
import { Row } from '../layout/row'
import { getLinkTarget } from '../widgets/linkify'
import { AddLiquidityModal } from './liquidity-modal'
import { ContractInfoDialog } from './contract-info-dialog'
import { WatchMarketModal } from './watch-market-modal'
import { ChangeBannerButton } from './change-banner-button'
import { GoGraph } from 'react-icons/go'

export function HeaderActions(props: {
  playContract: Contract
  setIsPlay: (isPlay: boolean) => void
  currentContract: Contract
  initialHideGraph: boolean
  hideGraph: boolean
  setHideGraph: (hideGraph: boolean) => void
}) {
  const {
    playContract,
    currentContract,
    initialHideGraph,
    hideGraph,
    setHideGraph,
    setIsPlay,
  } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isCreator = user?.id === playContract.creatorId

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [repostOpen, setRepostOpen] = useState(false)
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

  const dropdownItems = [
    ...(initialHideGraph
      ? [
          {
            name: hideGraph ? 'Show graph' : 'Hide graph',
            onClick: () => {
              setHideGraph(!hideGraph)
            },
            icon: <GoGraph className="h-5 w-5" />,
          },
        ]
      : []),
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
    ...(addLiquidityEnabled
      ? [
          {
            name: 'Liquidity',
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
    ...((user || privateUser) && !isCreator
      ? [
          {
            name: 'line',
            nonButtonContent: (
              <MenuSeparator className="bg-ink-400 mx-4 my-2 h-[1px]" />
            ),
          },
        ]
      : []),
    ...(user && !isCreator
      ? [
          {
            name: 'Report',
            onClick: () => {
              setReportOpen(true)
            },
            icon: <MdOutlineReport className="h-5 w-5" />,
            className:
              'text-orange-600 dark:text-orange-400 data-[focus]:!text-orange-700 dark:data-[focus]:!text-orange-300 data-[focus]:!bg-orange-100 dark:data-[focus]:!bg-ink-100',
          },
          {
            name: 'Uninterested',
            onClick: markUninteresting,
            icon: <TiVolumeMute className="h-5 w-5" />,
            className:
              'text-orange-600 dark:text-orange-400 data-[focus]:!text-orange-700 dark:data-[focus]:!text-orange-300 data-[focus]:!bg-orange-100 dark:data-[focus]:!bg-ink-100',
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
              : 'text-orange-600 dark:text-orange-400 data-[focus]:!text-orange-700 dark:data-[focus]:!text-orange-300 data-[focus]:!bg-orange-100 dark:data-[focus]:!bg-ink-100',
          },
        ]
      : []),
  ]

  return (
    <Row className="mr-4 shrink-0 items-center [&>*]:flex">
      {!playContract.coverImageUrl && isCreator && (
        <ChangeBannerButton
          contract={playContract}
          className="ml-3 first:ml-0"
        />
      )}
      <FollowMarketIconButton contract={currentContract} user={user} />
      <CopyLinkOrShareButton
        url={getShareUrl(currentContract, user?.username)}
        tooltip="Copy question share link"
        className="text-ink-500 hover:text-ink-600"
        size="xs"
        eventTrackingName="copy market link"
        trackingInfo={{ contractId: currentContract.id }}
      />
      <DropdownMenu items={dropdownItems} />
      <ContractInfoDialog
        playContract={playContract}
        statsContract={currentContract}
        user={user}
        setIsPlay={setIsPlay}
        open={detailsOpen}
        setOpen={setDetailsOpen}
      />
      {repostOpen && (
        <RepostModal
          playContract={playContract}
          open={repostOpen}
          setOpen={setRepostOpen}
        />
      )}
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
