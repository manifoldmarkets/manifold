import clsx from 'clsx'
import { sum } from 'lodash'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Contract, contractPool } from 'common/contract'
import {
  ENV_CONFIG,
  isAdminId,
  isModId,
  supabaseConsoleContractPath,
} from 'common/envs/constants'
import { BETTORS, User } from 'common/user'
import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { capitalize, sumBy } from 'lodash'
import { toast } from 'react-hot-toast'
import { TiVolumeMute } from 'react-icons/ti'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { useAdmin, useDev, useTrusted } from 'web/hooks/use-admin'
import {
  api,
  updateMarket,
  updateUserDisinterestEmbedding,
} from 'web/lib/api/api'
import { formatTime } from 'web/lib/util/time'
import { Button } from '../buttons/button'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { DuplicateContractButton } from '../buttons/duplicate-contract-button'
import { ReportButton } from '../buttons/report-button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { Table } from '../widgets/table'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { ContractHistoryButton } from './contract-edit-history-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import dayjs from 'dayjs'
import SuperBanControl from '../SuperBanControl'
import { BoostButton } from './boost-button'
import { SubsidizeButton } from './subsidize-button'
import { Stats } from './contract-info-dialog'

export function TwombaContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, open, setOpen } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const isCreator = user?.id === contract.creatorId

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <Stats contract={contract} user={user} />

      {!!user && (
        <>
          <Row className="my-2 flex-wrap gap-2">
            <ContractHistoryButton contract={contract} />
            <ShareQRButton contract={contract} />
            <ShareIRLButton contract={contract} />
            <ShareEmbedButton contract={contract} />
          </Row>
          <Row className="flex-wrap gap-2">
            {isAdmin || isTrusted ? (
              <SuperBanControl userId={contract.creatorId} />
            ) : null}
          </Row>
        </>
      )}
    </Modal>
  )
}
