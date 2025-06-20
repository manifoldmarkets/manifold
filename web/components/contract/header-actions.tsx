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
import { FollowMarketModal } from './follow-market-modal'
import { ChangeBannerButton } from './change-banner-button'
import { GoGraph } from 'react-icons/go'

export function HeaderActions(props: {
  contract: Contract
  initialHideGraph: boolean
  hideGraph: boolean
  setHideGraph: (hideGraph: boolean) => void
}) {
  const { contract, initialHideGraph, hideGraph, setHideGraph } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isCreator = user?.id === contract.creatorId

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [repostOpen, setRepostOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [liquidityOpen, setLiquidityOpen] = useState(false)

  const duplicateHref = duplicateContractHref(contract)

  const isBlocked =
    privateUser && privateUser.blockedContractIds?.includes(contract.id)

  const onBlock = async () => {
    await toast.promise(
      api('market/:contractId/block', { contractId: contract.id }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see this question in your feed nor search.`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await api('market/:contractId/unblock', { contractId: contract.id })
  }

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId: contract.creatorId,
    })
    toast(`We won't show you content like that again`, {
      icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
    })
  }

  const contractOpenAndPublic =
    !contract.isResolved &&
    (contract.closeTime ?? Infinity) > Date.now() &&
    contract.visibility == 'public'

  const addLiquidityEnabled =
    user &&
    (contract.mechanism == 'cpmm-1' || contract.mechanism == 'cpmm-multi-1') &&
    contractOpenAndPublic

  const [following, setFollowing] = useState<boolean>()
  const [followingOpen, setFollowingOpen] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    db.from('contract_follows')
      .select('contract_id')
      .eq('follow_id', user.id)
      .eq('contract_id', contract.id)
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
                await unfollowMarket(contract.id, contract.slug)
                setFollowing(false)
              } else {
                await followMarket(contract.id, contract.slug)
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
      {!contract.coverImageUrl && isCreator && (
        <ChangeBannerButton contract={contract} className="ml-3 first:ml-0" />
      )}
      <FollowMarketIconButton contract={contract} user={user} />
      <CopyLinkOrShareButton
        url={getShareUrl(contract, user?.username)}
        tooltip="Copy question share link"
        className="text-ink-500 hover:text-ink-600"
        size="xs"
        eventTrackingName="copy market link"
        trackingInfo={{ contractId: contract.id }}
      />
      <DropdownMenu items={dropdownItems} />
      <ContractInfoDialog
        contract={contract}
        user={user}
        open={detailsOpen}
        setOpen={setDetailsOpen}
      />
      {repostOpen && (
        <RepostModal
          playContract={contract}
          open={repostOpen}
          setOpen={setRepostOpen}
        />
      )}
      {addLiquidityEnabled && (
        <AddLiquidityModal
          contract={contract}
          isOpen={liquidityOpen}
          setOpen={setLiquidityOpen}
        />
      )}
      <ReportModal
        isModalOpen={reportOpen}
        label={'contract'}
        setIsModalOpen={setReportOpen}
        report={{
          contentId: contract.id,
          contentType: 'contract',
          contentOwnerId: contract.creatorId,
        }}
      />
      <FollowMarketModal
        open={followingOpen}
        setOpen={setFollowingOpen}
        title={`You ${following ? 'followed' : 'unfollowed'} a question!`}
      />
    </Row>
  )
}
