import { Transition } from '@headlessui/react';
import clsx from 'clsx';
import { Group } from 'common/group';
import * as Packets from 'common/packet-ids';
import { PacketCreateMarket, PacketHandshakeComplete, PacketMarketCreated } from 'common/packets';
import { LiteMarket, LiteUser } from 'common/types/manifold-api-types';
import Head from 'next/head';
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import Textarea from 'react-expanding-textarea';
import io, { Socket } from 'socket.io-client';
import { DisconnectDescription } from 'socket.io-client/build/esm/socket';
import { AdditionalControlsDropdown } from 'web/components/additional-controls-dropdown';
import ContractCard from 'web/components/contract-card';
import { InfoTooltip } from 'web/components/info-tooltip';
import { Col } from 'web/components/layout/col';
import { Row } from 'web/components/layout/row';
import { LoadingOverlay } from 'web/components/loading-overlay';
import { Title } from 'web/components/title';
import { ConnectionState } from 'web/lib/connection-state';
import { SelectedGroup } from 'web/lib/selected-group';
import { CONTRACT_ANTE, formatMoney, Resolution } from 'web/lib/utils';
import { ConfirmationButton } from '../components/confirmation-button';
import { GroupSelector } from '../components/group-selector';

let socket: Socket;
let APIBase = undefined;

async function fetchMarketsInGroup(group: Group): Promise<LiteMarket[]> {
  const r = await fetch(`${APIBase}group/by-id/${group.id}/markets`);
  const markets = (await r.json()) as LiteMarket[];

  // Sort the markets for most recently created first:
  markets.sort((a, b) => b.createdTime - a.createdTime);

  // Sort the markets such that the display order is Featureable markets > Closed markets > Unsupported markets:
  const now = Date.now();
  const marketWeight = (a: LiteMarket) => {
    if (a.outcomeType !== 'BINARY') return 3;
    if (a.closeTime < now) return 2;
    return 1;
  };
  markets.sort((a, b) => marketWeight(a) - marketWeight(b));

  return markets;
}

async function fetchMarketById(id: string): Promise<LiteMarket> {
  const r = await fetch(`${APIBase}market/${id}`);
  const market = (await r.json()) as LiteMarket;
  return market;
}

async function getUserBalance(userID: string): Promise<number> {
  const r = await fetch(`${APIBase}user/by-id/${userID}`);
  const user = (await r.json()) as LiteUser;
  return user.balance;
}

export default () => {
  const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(undefined);
  const [balance, setBalance] = useState(0);
  const [question, setQuestion] = useState('');
  const [questionCreateError, setQuestionCreateError] = useState<string | undefined>(undefined);
  const [loadingContracts, setLoadingContracts] = useState<boolean>(false);
  const [contracts, setContracts] = useState<LiteMarket[]>([]);
  const [selectedContract, setSelectedContract] = useState<LiteMarket | undefined>(undefined);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to server...');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.CONNECTING);
  const [manifoldUserID, setManifoldUserID] = useState<string>(undefined);
  const [refreshSignal, forceRefreshGroups] = useState(0);
  const [ping, setPing] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const ante = CONTRACT_ANTE;
  const onSubmitNewQuestion = async () => {
    setIsSubmittingQuestion(true);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.emit(Packets.CREATE_MARKET, { groupId: selectedGroup.id, question: question } as PacketCreateMarket);
        socket.once(Packets.MARKET_CREATED, async (packet: PacketMarketCreated) => {
          if (packet.failReason) {
            reject(new Error(packet.failReason));
            return;
          }
          forceRefreshGroups((i) => ++i);
          onContractFeature(await fetchMarketById(packet.id));
          resolve();
        });
        setTimeout(() => reject(new Error('Timeout')), 20000);
      });
      localStorage.setItem('PREV_QUESTION', question);
      return true;
    } catch (e) {
      console.trace(e);
      setQuestionCreateError(e.message);
      return false;
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  useEffect(() => {
    let pingSent = Date.now();

    const params = new Proxy(new URLSearchParams(window.location.search), {
      get: (searchParams, prop) => searchParams.get(prop as string),
    });
    socket = io({ query: { type: 'dock', controlToken: params['t'] }, rememberUpgrade: true, reconnectionDelay: 100, reconnectionDelayMax: 100 });

    let pingRepeatTask: NodeJS.Timeout = null;
    const sendPing = () => {
      clearTimeout(pingRepeatTask);
      socket.emit(Packets.PING);
      pingSent = Date.now();
    };
    socket.on(Packets.PONG, () => {
      const ping = Date.now() - pingSent;
      setPing(ping);

      pingRepeatTask = setTimeout(() => {
        sendPing();
      }, 1000);
    });

    socket.on('connect', () => {
      console.debug(`Using transport: ${socket.io.engine.transport.name}`);
      socket.io.engine.on('upgrade', () => {
        console.debug(`Upgraded transport: ${socket.io.engine.transport.name}`);
      });
      sendPing();
    });
    socket.on('connect_error', (err) => {
      setLoadingMessage('Failed to connect to server: ' + err.message);
      setConnectionState(ConnectionState.FAILED);
    });
    socket.on('disconnect', (reason: Socket.DisconnectReason, description?: DisconnectDescription) => {
      const reasons: { reason: Socket.DisconnectReason; desc: string }[] = [
        { reason: 'io server disconnect', desc: 'The server has forcefully disconnected the socket with socket.disconnect()' },
        { reason: 'io client disconnect', desc: 'The socket was manually disconnected using socket.disconnect()' },
        { reason: 'ping timeout', desc: 'The server did not send a PING within the pingInterval + pingTimeout range' },
        { reason: 'transport close', desc: 'The connection was closed (example: the user has lost connection, or the network was changed from WiFi to 4G)' },
        { reason: 'transport error', desc: 'The connection has encountered an error (example: the server was killed during a HTTP long-polling cycle)' },
      ];

      let desc: DisconnectDescription | string = description;
      for (const r of reasons) {
        if (r.reason === reason) {
          desc = r.desc;
          break;
        }
      }

      console.debug(`Lost connection to server [reason: ${reason}, description: ${JSON.stringify(desc)}]`);
      setConnectionState(ConnectionState.CONNECTING);
      setLoadingMessage('Connecting to server...');

      if (reason === 'io server disconnect') {
        console.debug('Manual reconnect');
        socket.connect();
      }
    });
    socket.on(Packets.HANDSHAKE_COMPLETE, (p: PacketHandshakeComplete) => {
      const firstConnect = APIBase === undefined;
      APIBase = p.manifoldAPIBase;

      if (firstConnect) {
        setManifoldUserID(p.actingManifoldUserID);
        getUserBalance(p.actingManifoldUserID).then((b) => setBalance(b));
        setSelectedContract(undefined);
      }

      console.debug('Socked connected to server');
      setConnectionState(ConnectionState.CONNECTED);
      setLoadingMessage('Connected');
      setInitialized(true);
    });

    socket.io.on('reconnect', () => {
      console.debug('Reconnected');
      setConnectionState(ConnectionState.CONNECTED);
      setLoadingMessage('Connected');
    });

    socket.on(Packets.RESOLVED, () => {
      console.debug('Market resolved');
      setSelectedContract(undefined);
      if (selectedGroup) {
        setLoadingContracts(true);
        fetchMarketsInGroup(selectedGroup)
          .then((markets) => {
            setContracts(markets);
          })
          .finally(() => {
            setLoadingContracts(false);
          });
      }
    });

    socket.on(Packets.SELECT_MARKET_ID, async (marketID) => {
      console.debug('Selecting market: ' + marketID);
      const market = await fetchMarketById(marketID);
      setSelectedContract(market);
    });

    socket.on(Packets.UNFEATURE_MARKET, () => {
      setSelectedContract(undefined);
    });
  }, []);

  const onContractFeature = (contract: LiteMarket) => {
    setSelectedContract(contract);
    socket.emit(Packets.SELECT_MARKET_ID, contract.id);
  };

  const onContractUnfeature = () => {
    socket.emit(Packets.UNFEATURE_MARKET);
    setSelectedContract(undefined);
  };

  const firstLoad = useRef(false);
  useEffect(() => {
    if (selectedGroup) {
      setLoadingContracts(true);
      fetchMarketsInGroup(selectedGroup)
        .then((markets) => {
          setContracts(markets);
        })
        .finally(() => {
          setLoadingContracts(false);
        });
    } else {
      setContracts([]);
    }
    if (firstLoad.current) {
      localStorage.setItem('SELECTED_GROUP', selectedGroup && JSON.stringify({ groupID: selectedGroup.id, groupName: selectedGroup.name } as SelectedGroup));
    } else {
      const previousQuestion = localStorage.getItem('PREV_QUESTION');
      if (previousQuestion) {
        setQuestion(previousQuestion);
      }
    }
    firstLoad.current = true;
  }, [selectedGroup]);

  return (
    <>
      <Head>
        <title>Dock</title>
      </Head>
      <LoadingOverlay
        visible={connectionState != ConnectionState.CONNECTED}
        message={loadingMessage}
        loading={connectionState == ConnectionState.CONNECTING}
        className="bg-base-200 text-slate-500"
        spinnerBorderColor="border-slate-500"
      />
      {initialized && (
        <div className="flex justify-center">
          <div className="max-w-xl grow flex flex-col h-screen overflow-hidden relative">
            <div className="p-2">
              <div className="flex flex-row justify-center">
                <GroupSelector userID={manifoldUserID} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} refreshSignal={refreshSignal} APIBase={APIBase} />
                <AdditionalControlsDropdown socket={socket} />
              </div>
              <div className="w-full flex justify-center">
                <ConfirmationButton
                  openModalBtn={{
                    label: `Create and feature a question`,
                    className: clsx(
                      !selectedGroup ? 'btn-disabled' : 'from-indigo-500 to-blue-500 hover:from-indigo-700 hover:to-blue-700 bg-gradient-to-r border-0 w-full rounded-md',
                      'uppercase w-full mt-2 py-2.5 font-semibold text-white shadow-sm min-h-11 !h-[unset] text-2xs min-h-0 xs:min-h-11 xs:text-base'
                    ),
                  }}
                  submitBtn={{
                    label: 'Create',
                    className: clsx('normal-case btn', question.trim().length == 0 || ante > balance ? 'btn-disabled' : isSubmittingQuestion ? 'loading btn-disabled' : 'btn-primary'),
                  }}
                  cancelBtn={{
                    className: isSubmittingQuestion ? 'btn-disabled' : '',
                  }}
                  onSubmitWithSuccess={onSubmitNewQuestion}
                  onOpenChanged={() => {
                    getUserBalance(manifoldUserID).then((b) => setBalance(b));
                  }}
                >
                  <Title className="!my-0 text-lg xs:text-2xl" text={`Create a new question ${selectedGroup ? `in '${selectedGroup.name}'` : ''}`} />

                  <form>
                    <div className="form-control w-full">
                      <label className="label">
                        <span className="mb-1">
                          Question<span className={'text-red-700'}>*</span>
                        </span>
                      </label>

                      <Textarea
                        placeholder="e.g. Will the Democrats win the 2024 US presidential election?"
                        className="input input-bordered resize-none"
                        autoFocus
                        maxLength={240}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value || '')}
                      />
                    </div>
                  </form>

                  <Row className="form-control items-start">
                    <Row className="gap-2 grow items-center justify-items-start flex">
                      <span>Cost:</span>
                      <InfoTooltip text={`Cost to create your question. This amount is used to subsidize betting.`} />
                    </Row>

                    <div className="label-text text-neutral pl-1 justify-self-end self-center">{`M$${ante}`} </div>
                  </Row>
                  {ante > balance && (
                    <div className="-mt-4 mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
                      <span className="mr-2 text-red-500">Insufficient balance ({formatMoney(balance)})</span>
                    </div>
                  )}
                  {questionCreateError && (
                    <div className="-mt-1 mr-auto self-center whitespace-nowrap text-sm font-medium tracking-wide">
                      <span className="mr-2 text-red-500">Failed to create question: {questionCreateError}</span>
                    </div>
                  )}
                </ConfirmationButton>
              </div>
            </div>

            <div className="p-2 overflow-y-auto relative grow flex flex-col">
              {loadingContracts ? (
                <div className="flex justify-center grow animate-fade">
                  <div style={{ borderTopColor: 'transparent' }} className="w-10 h-10 border-4 border-primary border-solid rounded-full animate-spin" />
                </div>
              ) : contracts.length > 0 ? (
                contracts.map((contract, index) => (
                  <Transition key={contract.id} appear show as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 -translate-y-4" enterTo="opacity-100 translate-y-0">
                    <div className="mb-2 hover:z-10" style={{ transitionDelay: index * 50 + 'ms' }}>
                      <ContractCard controlUserID={manifoldUserID} contract={contract} onFeature={() => onContractFeature(contract)} />
                    </div>
                  </Transition>
                ))
              ) : (
                selectedGroup && <p className="w-full text-center text-gray-400 select-none">No applicable markets in this group</p>
              )}
            </div>
            <Transition
              unmount={false}
              as={Fragment}
              show={selectedContract != undefined}
              enter="ease-out duration-150"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
            </Transition>
            {selectedContract && (
              <div
                className={clsx('bg-base-200 fixed inset-0 flex flex-col items-center overflow-y-auto p-2', selectedContract ?? 'pointer-events-none')}
                style={{
                  backgroundImage:
                    // "url(\"data:image/svg+xml,<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='75' height='75' patternTransform='scale(1) rotate(0)'><rect x='0' y='0' width='100%' height='100%' fill='hsla(0, 0%, 100%, 0)'/><path d='M32.763-11.976c-1.05-.075-1.95.676-2.024 1.726L29.764.849c-.075 1.05.675 1.95 1.725 2.026 1.05.075 1.95-.675 2.025-1.725l.975-11.1c.075-1.05-.675-1.95-1.725-2.025zM54.299 1.32a1.912 1.912 0 0 0-.386.015c-.975.15-1.725 1.05-1.575 2.1l1.5 11.025c.15.975 1.05 1.725 2.1 1.575a1.732 1.732 0 0 0 1.575-2.1l-1.5-11.025c-.131-.853-.836-1.533-1.714-1.59zm-46.93 1.22a1.809 1.809 0 0 0-1.662 1.663c-.075 1.05.675 1.952 1.65 2.027l11.1 1.05c.975.15 1.95-.601 2.025-1.651.15-.975-.6-1.95-1.65-2.025l-11.1-1.05a1.643 1.643 0 0 0-.363-.015zM1.76 13.017a1.825 1.825 0 0 0-1.285.6l-7.65 8.101c-.75.75-.675 1.95.075 2.625s1.95.674 2.625-.076l7.651-8.099c.75-.75.674-1.95-.076-2.625a1.785 1.785 0 0 0-1.34-.526zm75 0a1.825 1.825 0 0 0-1.285.6l-7.65 8.101c-.75.75-.675 1.95.075 2.625s1.95.674 2.625-.076l7.651-8.099c.75-.75.674-1.95-.076-2.625a1.785 1.785 0 0 0-1.34-.526zm-39.731 2.906a1.785 1.785 0 0 0-1.34.527l-7.95 7.723c-.75.675-.826 1.875-.076 2.625.675.75 1.875.752 2.625.077l7.95-7.725c.75-.675.826-1.875.076-2.625a1.825 1.825 0 0 0-1.285-.602zm24.639 18.928c-.24.02-.48.085-.705.197a1.903 1.903 0 0 0-.825 2.55l5.1 9.902a1.902 1.902 0 0 0 2.55.824c.975-.45 1.276-1.574.826-2.55l-5.1-9.9c-.395-.73-1.125-1.083-1.846-1.023zm-50.37-4.862a1.756 1.756 0 0 0-1.035.336c-.825.6-1.05 1.725-.524 2.625l6.15 9.223c.6.9 1.8 1.127 2.625.526.9-.6 1.124-1.8.524-2.624l-6.15-9.226a1.912 1.912 0 0 0-1.59-.86zm32.705 9.766c-.12-.006-.243 0-.365.019l-10.95 2.175c-1.05.15-1.725 1.126-1.5 2.176.15 1.05 1.126 1.725 2.176 1.5l10.95-2.175c1.05-.15 1.725-1.125 1.5-2.175a1.99 1.99 0 0 0-1.811-1.52zm4.556 12.195a1.932 1.932 0 0 0-1.845.949c-.45.9-.15 2.025.75 2.55l9.75 5.4c.9.45 2.025.15 2.55-.75.525-.9.15-2.025-.75-2.55l-9.75-5.4a1.958 1.958 0 0 0-.705-.199zM71.913 58c-1.05-.075-1.875.748-1.95 1.798l-.45 11.1c-.075 1.05.75 1.876 1.8 1.95.975 0 1.875-.75 1.95-1.8l.45-11.1c.075-1.05-.75-1.873-1.8-1.948zm-55.44 1.08a1.865 1.865 0 0 0-1.035.42l-8.775 6.825c-.75.6-.9 1.8-.3 2.625.6.75 1.8.9 2.626.3l8.775-6.827c.75-.6.9-1.8.3-2.625a1.783 1.783 0 0 0-1.591-.72zm16.29 3.945c-1.05-.075-1.95.675-2.024 1.725l-.975 11.099c-.075 1.05.675 1.95 1.725 2.026 1.05.075 1.95-.675 2.025-1.725l.975-11.102c.075-1.05-.675-1.95-1.725-2.024z'  stroke-width='1' stroke='none' fill='hsla(259, 0%, 94%, 1)'/></pattern></defs><rect width='800%' height='800%' transform='translate(0,0)' fill='url(%23a)'/></svg>\")",
                    "url(\"data:image/svg+xml,<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='50.41' height='87' patternTransform='scale(2) rotate(0)'><rect x='0' y='0' width='100%' height='100%' fill='hsla(0, 0%, 100%, 0)'/><path d='M25.3 87L12.74 65.25m0 14.5h-25.12m75.18 0H37.68M33.5 87l25.28-43.5m-50.23 29l4.19 7.25L16.92 87h-33.48m33.48 0h16.75-8.37zM8.55 72.5L16.92 58m50.06 29h-83.54m79.53-50.75L50.4 14.5M37.85 65.24L50.41 43.5m0 29l12.56-21.75m-50.24-14.5h25.12zM33.66 29l4.2 7.25 4.18 7.25M33.67 58H16.92l-4.18-7.25M-8.2 72.5l20.92-36.25L33.66 0m25.12 72.5H42.04l-4.19-7.26L33.67 58l4.18-7.24 4.19-7.25M33.67 29l8.37-14.5h16.74m0 29H8.38m29.47 7.25H12.74M50.4 43.5L37.85 21.75m-.17 58L25.12 58M12.73 36.25L.18 14.5M0 43.5l-12.55-21.75M24.95 29l12.9-21.75M12.4 21.75L25.2 0M12.56 7.25h-25.12m75.53 0H37.85M58.78 43.5L33.66 0h33.5m-83.9 0h83.89M33.32 29H16.57l-4.18-7.25-4.2-7.25m.18 29H-8.37M-16.74 0h33.48l-4.18 7.25-4.18 7.25H-8.37m8.38 58l12.73-21.75m-25.3 14.5L0 43.5m-8.37-29l21.1 36.25 20.94 36.24M8.37 72.5H-8.36'  stroke-width='1' stroke='hsla(259, 0%, 95%, 1)' fill='none'/></pattern></defs><rect width='800%' height='800%' transform='translate(0,0)' fill='url(%23a)'/></svg>\")",
                }}
              >
                <Transition appear unmount={false} show as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 -translate-y-4" enterTo="opacity-100 translate-y-0">
                  <div className="w-full max-w-xl grow flex flex-col justify-end">
                    <ResolutionPanel controlUserID={manifoldUserID} contract={selectedContract} onUnfeatureMarket={onContractUnfeature} ping={ping} />
                  </div>
                </Transition>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

function ResolutionPanel(props: { controlUserID: string; contract: LiteMarket; onUnfeatureMarket: () => void; ping?: number }) {
  const { controlUserID, contract, onUnfeatureMarket, ping } = props;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Resolution | undefined>();

  // const earnedFees = contract.mechanism === "dpm-2" ? `${DPM_CREATOR_FEE * 100}% of trader profits` : `${formatMoney((contract as any).fees.creatorFee)} in fees`;

  const submitButtonClass =
    outcome === 'YES'
      ? 'btn-primary'
      : outcome === 'NO'
      ? 'bg-red-400 hover:bg-red-500'
      : outcome === 'CANCEL'
      ? 'bg-yellow-400 hover:bg-yellow-500'
      : outcome === 'MKT'
      ? 'bg-blue-400 hover:bg-blue-500'
      : 'btn-disabled';

  const resolveClicked = async (): Promise<boolean> => {
    console.log('Resolve clicked: ' + outcome);
    socket.emit(Packets.RESOLVE, outcome);
    setIsSubmitting(true);
    return true;
  };

  const canResolveMarket = controlUserID === contract.creatorId;

  return (
    <Col className={'bg-white rounded-md shadow-md px-4 py-4 xs:px-8 xs:py-6 cursor-default flex justify-end'} onClick={(e) => e.stopPropagation()}>
      <Row className="justify-center items-center">
        <div className="xs:whitespace-nowrap text-lg xs:text-2xl text-center xs:text-left">Resolve market</div>
        <div className="grow" />
        <div className="min-h-10 hidden xs:block">{ping}ms</div>
      </Row>

      <p
        className="break-words font-semibold text-indigo-700 my-3"
        style={{
          wordBreak: 'break-word' /* For iOS safari */,
        }}
      >
        {contract.question}
      </p>

      {canResolveMarket ? (
        <>
          <div className="mb-3 text-sm text-gray-500">Outcome</div>

          <YesNoCancelSelector className="mx-auto my-2" selected={outcome} onSelect={setOutcome} btnClassName={isSubmitting ? 'btn-disabled' : ''} />

          <div className="my-2" />

          <div className="xs:text-base text-xs">
            {outcome === 'YES' ? (
              <>
                Winnings will be paid out to YES bettors.
                {/* <br /> */}
                {/* <br /> */}
                {/* You will earn {earnedFees}. */}
              </>
            ) : outcome === 'NO' ? (
              <>
                Winnings will be paid out to NO bettors.
                {/* <br /> */}
                {/* <br /> */}
                {/* You will earn {earnedFees}. */}
              </>
            ) : outcome === 'CANCEL' ? (
              <>All trades will be returned with no fees.</>
            ) : (
              //  : outcome === "MKT" ? (
              //     <Col className="gap-6">
              //         <div>Traders will be paid out at the probability you specify:</div>
              //         <ProbabilitySelector probabilityInt={Math.round(prob)} setProbabilityInt={setProb} />
              //         You will earn {earnedFees}.
              //     </Col>
              // )
              <>Resolving this market will immediately pay out traders.</>
            )}
          </div>

          {/* <div className="my-4" /> */}

          {/* {!!error && <div className="text-red-500">{error}</div>} */}

          <ResolveConfirmationButton onResolve={resolveClicked} isSubmitting={isSubmitting} openModalButtonClass={clsx('w-full mt-2', submitButtonClass)} submitButtonClass={submitButtonClass} />
        </>
      ) : (
        <>
          <span>
            Please ask <p className="inline font-bold">{contract.creatorName}</p> to resolve this market.
          </span>
          <div className="my-1" />
        </>
      )}
      <ConfirmationButton
        openModalBtn={{
          className: clsx('border-none self-start w-full mt-2', isSubmitting ? 'btn-disabled' : ''),
          label: 'Unfeature market',
        }}
        cancelBtn={{
          label: 'Back',
        }}
        submitBtn={{
          label: 'Unfeature',
          className: clsx('border-none btn-primary'),
        }}
        onSubmitWithSuccess={async () => {
          onUnfeatureMarket();
          return true;
        }}
      >
        <p>
          Are you sure you want to unfeature this market? <b>You will have to resolve it later on the Manifold website.</b>
        </p>
      </ConfirmationButton>
    </Col>
  );
}

export function ResolveConfirmationButton(props: { onResolve: () => Promise<boolean>; isSubmitting: boolean; openModalButtonClass?: string; submitButtonClass?: string }) {
  const { onResolve, isSubmitting, openModalButtonClass, submitButtonClass } = props;
  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx('border-none self-start', openModalButtonClass, isSubmitting && '!btn-disabled loading'),
        label: 'Resolve',
      }}
      cancelBtn={{
        label: 'Back',
      }}
      submitBtn={{
        label: 'Resolve',
        className: clsx('border-none', submitButtonClass),
      }}
      onSubmitWithSuccess={onResolve}
    >
      <p>Are you sure you want to resolve this market?</p>
    </ConfirmationButton>
  );
}

export function YesNoCancelSelector(props: { selected: Resolution | undefined; onSelect: (selected: Resolution) => void; className?: string; btnClassName?: string }) {
  const { selected, onSelect } = props;

  const btnClassName = clsx('px-6 flex-1 rounded-3xl', props.btnClassName);

  return (
    <Col className="gap-2">
      {/* Should ideally use a radio group instead of buttons */}
      <Button color={selected === 'YES' ? 'green' : 'gray'} onClick={() => onSelect('YES')} className={btnClassName}>
        YES
      </Button>

      <Button color={selected === 'NO' ? 'red' : 'gray'} onClick={() => onSelect('NO')} className={btnClassName}>
        NO
      </Button>

      {/* <Button color={selected === "MKT" ? "blue" : "gray"} onClick={() => onSelect("MKT")} className={clsx(btnClassName, "btn-sm")}>
                PROB
            </Button> */}

      <Button color={selected === 'CANCEL' ? 'yellow' : 'gray'} onClick={() => onSelect('CANCEL')} className={clsx(btnClassName, 'btn-sm')}>
        N/A
      </Button>
    </Col>
  );
}

function Button(props: { className?: string; onClick?: () => void; color: 'green' | 'red' | 'blue' | 'indigo' | 'yellow' | 'gray'; children?: ReactNode }) {
  const { className, onClick, children, color } = props;

  return (
    <button
      type="button"
      className={clsx(
        'inline-flex flex-1 items-center justify-center rounded-md border border-transparent px-8 py-3 font-medium shadow-sm',
        color === 'green' && 'btn-primary text-white',
        color === 'red' && 'bg-red-400 text-white hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 text-white hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 text-white hover:bg-blue-500',
        color === 'indigo' && 'bg-indigo-500 text-white hover:bg-indigo-600',
        color === 'gray' && 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        className
      )}
      onClick={(e) => {
        onClick && onClick();
        e.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}
