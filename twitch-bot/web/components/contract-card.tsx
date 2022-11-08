import { InformationCircleIcon, TrendingUpIcon } from '@heroicons/react/outline';
import { SparklesIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import { LiteMarket } from 'common/types/manifold-api-types';
import { DAY_MS, formatMoney } from 'web/lib/utils';
import { Avatar } from './avatar';
import { ConfirmationButton } from './confirmation-button';
import { Col } from './layout/col';
import { Row } from './layout/row';

export default function ContractCard(props: { controlUserID: string; contract: LiteMarket; onFeature: () => void }) {
  const { controlUserID, contract, onFeature } = props;
  const isClosed = contract.closeTime < Date.now();
  const isResolved = contract.isResolved;
  const isFeatureable = !isClosed && contract.outcomeType === 'BINARY';
  const canResolveMarket = controlUserID === contract.creatorId;
  return (
    <Col className={clsx('group relative gap-3 rounded-lg bg-white py-4 p-4 xs:pl-6 pr-5 shadow-md', !isFeatureable && 'bg-gray-100')}>
      <div className="flex flex-col xs:flex-row">
        <Col className="relative flex-1 gap-3 pr-1">
          {/* <div className={clsx('absolute -left-6 -top-4 -bottom-4 right-0')}></div> */}
          <AvatarDetails contract={contract} />
          <p
            className={clsx('break-words font-semibold text-indigo-700')}
            style={{
              wordBreak: 'break-word' /* For iOS safari */,
            }}
          >
            {contract.question}
          </p>

          <Row className="max-w-sm">
            <MiscDetails contract={contract} />
          </Row>
        </Col>
        <Col className="xs:items-end items-stretch">
          <Col className="grow justify-center">
            {contract.outcomeType === 'BINARY' && <BinaryResolutionOrChance className="items-center" contract={contract} />}

            {/* {contract.outcomeType === "PSEUDO_NUMERIC" && <PseudoNumericResolutionOrExpectation className="items-center" contract={contract} />}

            {contract.outcomeType === "NUMERIC" && <NumericResolutionOrExpectation className="items-center" contract={contract} />}

            {(contract.outcomeType === "FREE_RESPONSE" || contract.outcomeType === "MULTIPLE_CHOICE") && (
                <FreeResponseResolutionOrChance className="self-end text-gray-600" contract={contract} truncate="long" />
            )} */}
            <ProbBar previewProb={contract.probability} />
          </Col>
          <Row className="items-center mt-2">
            {(isResolved || contract.outcomeType !== 'BINARY' || isClosed) && (
              <div
                className="tooltip tooltip-right xs:tooltip pr-1 before:content-[attr(data-tip)] xs:before:max-w-[15em] before:max-w-[calc(100vw-5rem)] before:z-50 before:!transition-[opacity] before:duration-200"
                data-tip={isResolved ? 'This market has been resolved' : contract.outcomeType !== 'BINARY' ? 'This type of market is not currently supported' : 'This market is currently closed'}
              >
                <InformationCircleIcon className="h-5 w-5 text-gray-500" />
              </div>
            )}
            <ConfirmationButton
              openModalBtn={{
                className: clsx('z-40 btn btn-sm border-2 rounded-lg grow', contract.outcomeType !== 'BINARY' || isClosed ? 'btn-disabled' : 'btn-outline btn-secondary'),
                label: 'Feature',
              }}
              cancelBtn={{
                label: 'Back',
              }}
              submitBtn={{
                label: 'Feature',
                className: clsx('border-none btn-primary'),
              }}
              onSubmitWithSuccess={async () => {
                onFeature();
                return true;
              }}
            >
              <p>Are you sure you want to feature this market?{!canResolveMarket && <b> As you don't own it, you will need to ask {contract.creatorName} to resolve it for you.</b>}</p>
            </ConfirmationButton>
          </Row>
        </Col>
      </div>
    </Col>
  );
}

function MiscDetails(props: { contract: LiteMarket; showHotVolume?: boolean; showTime?: boolean; hideGroupLink?: boolean }) {
  const { contract, showHotVolume } = props;
  const { volume, volume24Hours, isResolved, createdTime } = contract;

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved;

  return (
    <Row className="items-center gap-3 text-sm text-gray-400 w-full">
      {showHotVolume ? (
        <Row className="gap-0.5">
          <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
        </Row>
      ) : volume > 0 || !isNew ? (
        <Row className={'shrink-0'}>{formatMoney(contract.volume)} bet</Row>
      ) : (
        <NewContractBadge />
      )}
    </Row>
  );
}

function NewContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
      <SparklesIcon className="h-4 w-4" aria-hidden="true" /> New
    </span>
  );
}

function AvatarDetails(props: { contract: LiteMarket }) {
  const { contract } = props;
  const { creatorName, creatorUsername } = contract;

  return (
    <Row className="items-center gap-2 text-sm text-gray-400">
      <Avatar username={creatorUsername} avatarUrl={contract.creatorAvatarUrl} size={'xs'} />
      <p className="break-words hover:underline hover:decoration-indigo-400 hover:decoration-2">{creatorName}</p>
    </Row>
  );
}

function ProbBar(props: { previewProb?: number }) {
  const { previewProb } = props;
  const color = 'bg-primary';
  const prob = previewProb ?? 0.5;
  return (
    <>
      <div className={clsx('absolute right-0 top-0 w-1.5 rounded-tr-md transition-all', 'bg-gray-100')} style={{ height: `${100 * (1 - prob)}%` }} />
      <div
        className={clsx(
          'absolute right-0 bottom-0 w-1.5 rounded-br-md transition-all',
          `${color}`,
          // If we're showing the full bar, also round the top
          prob === 1 ? 'rounded-tr-md' : ''
        )}
        style={{ height: `${100 * prob}%` }}
      />
    </>
  );
}

function BinaryResolutionOrChance(props: { contract: LiteMarket; className?: string }) {
  const { contract, className } = props;
  const { resolution } = contract;
  // const textColor = `text-${getColor(contract)}`
  const textColor = 'text-primary'; //!!!

  return (
    <div className={clsx('text-xl xs:text-3xl', className)}>
      {resolution ? (
        <div className="xs:flex flex-col items-center">
          <div className={clsx('text-gray-500 text-base inline')}>Resolved</div>
          <div className="xs:hidden inline"> </div>
          <BinaryContractOutcomeLabel contract={contract} resolution={resolution} />
        </div>
      ) : (
        <div className="xs:flex flex-col items-center">
          <div className={clsx('inline text-lg xs:text-[length:unset] font-bold xs:font-normal', textColor)}>{(contract.probability * 100).toFixed(0)}%</div>
          <div className="xs:hidden inline"> </div>
          <div className={clsx('inline -my-1', textColor, 'text-base')}>chance</div>
        </div>
      )}
    </div>
  );
}

export function BinaryContractOutcomeLabel(props: { contract: LiteMarket; resolution: string }) {
  return <BinaryOutcomeLabel outcome={props.resolution} />;
}

export function BinaryOutcomeLabel(props: { outcome: string }) {
  const { outcome } = props;

  if (outcome === 'YES') return <YesLabel />;
  if (outcome === 'NO') return <NoLabel />;
  if (outcome === 'MKT') return <ProbLabel />;
  return <CancelLabel />;
}

export function YesLabel() {
  return <span className="text-primary">YES</span>;
}

export function HigherLabel() {
  return <span className="text-primary">HIGHER</span>;
}

export function LowerLabel() {
  return <span className="text-red-400">LOWER</span>;
}

export function NoLabel() {
  return <span className="text-red-400">NO</span>;
}

export function CancelLabel() {
  return <span className="text-yellow-400">N/A</span>;
}

export function ProbLabel() {
  return <span className="text-blue-400">PROB</span>;
}
