import { InformationCircleIcon, TrendingUpIcon } from '@heroicons/react/outline';
import { SparklesIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import { LiteMarket } from '@common/types/manifold-api-types';
import { DAY_MS, formatMoney } from 'web/lib/utils';
import { getMarketDisplayability } from 'web/pages/dock';
import { Avatar } from './avatar';
import { ConfirmationButton } from './confirmation-button';
import { Col } from './layout/col';
import { Row } from './layout/row';

export default function ContractCard(props: { controlUserID: string; contract: LiteMarket; onFeature: () => void }) {
  const { controlUserID, contract, onFeature } = props;
  const [isFeatureable, , message] = getMarketDisplayability(contract);
  const canResolveMarket = controlUserID === contract.creatorId;
  return (
    <Col className={clsx('xs:pl-6 bg-canvas-0 group relative gap-3 rounded-lg p-4 py-4 pr-5 shadow-md', !isFeatureable && 'bg-ink-100')}>
      <div className="xs:flex-row flex flex-col">
        <Col className="relative flex-1 gap-3 pr-1">
          <AvatarDetails contract={contract} />
          <p
            className={clsx('text-primary-700 break-words font-semibold')}
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
            <ProbBar previewProb={contract.probability} />
          </Col>
          <Row className="mt-2 items-center">
            {!isFeatureable && (
              <div
                className="tooltip tooltip-right xs:tooltip xs:before:max-w-[15em] pr-1 before:z-50 before:max-w-[calc(100vw-5rem)] before:!transition-[opacity] before:duration-200 before:content-[attr(data-tip)]"
                data-tip={message}
              >
                <InformationCircleIcon className="text-ink-500 h-5 w-5" />
              </div>
            )}
            <ConfirmationButton
              openModalBtn={{
                className: clsx('z-40 btn btn-sm border-2 rounded-lg grow', !isFeatureable ? 'btn-disabled' : 'btn-outline btn-secondary'),
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
              <p>Are you sure you want to feature this question?{!canResolveMarket && <b> As you don't own it, you will need to ask {contract.creatorName} to resolve it for you.</b>}</p>
            </ConfirmationButton>
          </Row>
        </Col>
      </div>
    </Col>
  );
}

function MiscDetails(props: { contract: LiteMarket; showHotVolume?: boolean; hideGroupLink?: boolean }) {
  const { contract, showHotVolume } = props;
  const { volume, volume24Hours, isResolved, createdTime } = contract;

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved;

  return (
    <Row className="text-ink-400 w-full items-center gap-3 text-sm">
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
    <Row className="text-ink-400 items-center gap-2 text-sm">
      <Avatar username={creatorUsername} avatarUrl={contract.creatorAvatarUrl} size={'xs'} />
      <p className="hover:decoration-primary-400 break-words hover:underline hover:decoration-2">{creatorName}</p>
    </Row>
  );
}

function ProbBar(props: { previewProb?: number }) {
  const { previewProb } = props;
  const color = 'bg-primary';
  const prob = previewProb ?? 0.5;
  return (
    <>
      <div className={clsx('absolute right-0 top-0 w-1.5 rounded-tr-md transition-all', 'bg-ink-100')} style={{ height: `${100 * (1 - prob)}%` }} />
      <div
        className={clsx(
          'absolute bottom-0 right-0 w-1.5 rounded-br-md transition-all',
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
    <div className={clsx('xs:text-3xl text-xl', className)}>
      {resolution ? (
        <div className="xs:flex flex-col items-center">
          <div className={clsx('text-ink-500 inline text-base')}>Resolved</div>
          <div className="xs:hidden inline"> </div>
          <BinaryContractOutcomeLabel contract={contract} resolution={resolution} />
        </div>
      ) : (
        <div className="xs:flex flex-col items-center">
          <div className={clsx('xs:text-[length:unset] xs:font-normal inline text-lg font-bold', textColor)}>{(contract.probability * 100).toFixed(0)}%</div>
          <div className="xs:hidden inline"> </div>
          <div className={clsx('-my-1 inline', textColor, 'text-base')}>chance</div>
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
