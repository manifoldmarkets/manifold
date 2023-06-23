/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import styles from '../styles/overlay.module.scss';

import Chart, { Point } from '../components/chart';

import { Transition } from '@headlessui/react';
import clsx from 'clsx';
import Head from 'next/head';
import { Fragment, useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { Col } from 'web/components/layout/col';
import { Row } from 'web/components/layout/row';

import { ResolutionOutcome } from '@common/outcome';
import { PacketAddBets, PacketClear, PacketHandshakeComplete, PacketResolved, PacketSelectMarket, PacketUnfeature } from '@common/packets';
import SocketWrapper from '@common/socket-wrapper';
import { AbstractMarket, NamedBet } from '@common/types/manifold-abstract-types';
import { DisconnectDescription } from 'socket.io-client/build/esm/socket';
import { LoadingOverlay } from '../components/loading-overlay';
import { ConnectionState } from '../lib/connection-state';
import { ENV_CONFIG } from '@manifold_common/envs/constants';

class BetElement {
  bet: NamedBet;
  element: HTMLDivElement;
}

class Application {
  readonly transactionTemplate: HTMLElement;
  readonly chart: Chart;
  readonly socket: Socket;
  readonly sw: SocketWrapper<Socket>;

  betElements: BetElement[] = [];

  currentProbability_percent = 0;
  animatedProbability_percent: number = this.currentProbability_percent;

  currentMarket: AbstractMarket = null;

  constructor() {
    this.transactionTemplate = document.getElementById('transaction-template');
    this.transactionTemplate.removeAttribute('id');
    this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

    this.chart = new Chart(document.getElementById('chart') as HTMLCanvasElement);

    this.resetUI();

    const animationFrame = () => {
      this.animatedProbability_percent += (this.currentProbability_percent - this.animatedProbability_percent) * 0.1;
      document.getElementById('chance').innerHTML = this.animatedProbability_percent.toFixed(0);

      window.requestAnimationFrame(animationFrame);
    };
    window.requestAnimationFrame(animationFrame);

    const params = new Proxy(new URLSearchParams(window.location.search), {
      get: (searchParams, prop) => searchParams.get(prop as string),
    });
    this.socket = io({ query: { type: 'overlay', controlToken: params['t'] }, rememberUpgrade: true });
    this.sw = new SocketWrapper(this.socket);
    this.socket.on('disconnect', (reason: Socket.DisconnectReason, description?: DisconnectDescription) => {
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

      if (reason === 'io server disconnect') {
        console.debug('Manual reconnect');
        this.socket.connect();
      }
    });
    this.registerPacketHandlers();
  }

  registerPacketHandlers() {
    this.sw.on(PacketAddBets, (p) => {
      try {
        for (const bet of p.bets) {
          this.addBet(bet);
        }
      } catch (e) {
        console.trace(e);
      }
    });
    this.sw.on(PacketSelectMarket, (p: PacketSelectMarket) => {
      console.debug(p);
      try {
        this.resetUI();
        this.loadMarket(p);
      } catch (e) {
        console.trace(e);
      }
    });
    this.sw.on(PacketClear, () => this.resetUI());
    this.socket.on('connect', () => {
      console.debug(`Using transport: ${this.socket.io.engine.transport.name}`);

      // This event handler needs to be registered inside the 'connect' handler:
      this.socket.io.engine.on('upgrade', () => {
        console.debug(`Upgraded transport: ${this.socket.io.engine.transport.name}`);
      });
    });
  }

  resetUI() {
    document.getElementById('question').innerHTML = '';
    this.chart.data = [];
    this.betElements.forEach((b) => {
      b?.element?.remove();
    });
    this.betElements = [];
  }

  loadMarket(p: PacketSelectMarket) {
    this.currentMarket = { ...p.market, initialBets: p.initialBets } as AbstractMarket;

    if (this.currentMarket.bets.length > 0) {
      this.currentMarket.probability = this.currentMarket.bets[this.currentMarket.bets.length - 1].probAfter;
    }

    const questionLength = this.currentMarket.question.length;
    const questionDiv = document.getElementById('question');
    if (questionLength < 60) {
      questionDiv.style.fontSize = '1.3em';
    } else if (questionLength < 150) {
      questionDiv.style.fontSize = '1.0em';
    } else {
      questionDiv.style.fontSize = '0.85em';
    }
    questionDiv.innerHTML = this.currentMarket.question;
    this.currentProbability_percent = this.currentMarket.probability * 100;
    this.animatedProbability_percent = this.currentProbability_percent;

    this.loadBettingHistory(p);

    setTimeout(() => this.chart.resize(), 50);
  }

  loadBettingHistory(p: PacketSelectMarket) {
    const data: Point[] = [];
    // Bets are stored oldest-first:
    data.push(new Point(Date.now() - 1e9, 0.5));
    if (p.market.bets.length > 0) {
      for (const bet of this.currentMarket.bets) {
        data.push(new Point(bet.createdTime, bet.probBefore));
        data.push(new Point(bet.createdTime, bet.probAfter));
      }
    }
    this.chart.data = data;

    for (const bet of p.initialBets) {
      this.addBet(bet, { addToChart: false, animateHeight: false });
    }
  }

  addBet(bet: NamedBet, options = { addToChart: true, animateHeight: true }) {
    const name = bet.username;

    const betAmountMagnitude = Math.abs(Math.ceil(bet.amount));

    let positiveBet = false;
    if ((bet.amount > 0 && bet.outcome == 'YES') || (bet.amount < 0 && bet.outcome == 'NO')) {
      positiveBet = true;
    }

    const t = this.transactionTemplate.cloneNode(true) as HTMLDivElement;
    document.getElementById('transactions').prepend(t);
    //
    t.querySelector('#name').innerHTML = name;
    t.querySelector('.amount').innerHTML = betAmountMagnitude.toFixed(0);
    t.querySelector('.boughtSold').innerHTML = (bet.amount < 0 ? 'sold ' : '') + ((bet.amount < 0 ? !positiveBet : positiveBet) ? 'YES' : 'NO');
    (t.querySelector('.color') as HTMLElement).style.color = positiveBet ? '#92ff83' : '#ff6666';

    const betElement = new BetElement();
    betElement.element = t;
    betElement.bet = bet;

    this.betElements.push(betElement);
    t.offsetLeft;

    if (!options.animateHeight) {
      t.style.minHeight = t.style.height = '1.2em';
      t.style.transition = 'none';
    } else {
      setTimeout(() => {
        t.classList.add('!min-h-[1.2em]');
        setTimeout(() => {
          t.style.transition = 'none';
        }, 1000);
      }, 10);
    }

    if (this.betElements.length > 3) {
      const transactionToRemove = this.betElements.shift().element;
      setTimeout(() => {
        transactionToRemove.remove();
      }, 1000);
    }

    if (this.currentMarket && options.addToChart) {
      this.currentMarket.probability = bet.probAfter;
      this.currentProbability_percent = this.currentMarket.probability * 100;
      this.chart.data.push(new Point(bet.createdTime, bet.probBefore));
      this.chart.data.push(new Point(bet.createdTime, bet.probAfter));
    }
  }
}

enum Page {
  MAIN,
  RESOLVED_RESULT,
  RESOLVED_TRADERS,
  RESOLVED_GRAPH,
}

let connectedServerID = undefined;
export default () => {
  const [page, setPage] = useState<Page>(Page.MAIN);
  const [resolvedData, setResolvedData] = useState<PacketResolved | undefined>(undefined);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to server...');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.CONNECTING);

  useEffect(() => {
    const app = new Application();
    app.socket.on('connect_error', (err) => {
      console.error(err);
      if (err.message !== 'xhr poll error') {
        setLoadingMessage(err.message);
        setConnectionState(ConnectionState.FAILED);
      }
    });
    app.socket.on('connect', () => {
      setConnectionState(ConnectionState.CONNECTED);
    });
    app.socket.on('disconnect', () => {
      // These lines are commented out as a test fix not showing temporary disconnects:
      // setLoadingMessage('Connecting to server...');
      // setConnectionState(ConnectionState.CONNECTING);
    });
    app.sw.on(PacketHandshakeComplete, (packet) => {
      if (!connectedServerID) {
        connectedServerID = packet.serverID;
      } else {
        if (packet.serverID !== connectedServerID) {
          location.reload(); // The server has been updated since we last connected, so let's refresh to make sure the client is also up to date
        }
      }
    });
    app.sw.on(PacketResolved, (p) => setResolvedData(p));
    app.sw.on(PacketClear, () => {
      setResolvedData(undefined);
      setOverlayVisible(false);
    });
    app.sw.on(PacketSelectMarket, () => {
      setResolvedData(undefined);
      setOverlayVisible(true);
    });
    app.sw.on(PacketUnfeature, () => {
      setResolvedData(undefined);
      setOverlayVisible(false);
    });
  }, []);

  useEffect(() => {
    if (resolvedData) {
      setPage(Page.RESOLVED_TRADERS);
      const interval = setInterval(() => {
        setPage((page) => {
          switch (page) {
            case Page.RESOLVED_RESULT:
              return Page.RESOLVED_TRADERS;
            case Page.RESOLVED_TRADERS:
              return Page.RESOLVED_GRAPH;
            case Page.RESOLVED_GRAPH:
              return Page.RESOLVED_TRADERS;
            default:
              throw new Error('Unhandled case: ' + page);
          }
        });
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [resolvedData]);

  return (
    <>
      <Head>
        <title>Overlay</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
        <style>{`
                    body,:root {
                        background-color: transparent !important;
                    }
                `}</style>
      </Head>
      <Transition
        appear
        as={Fragment}
        show={overlayVisible}
        unmount={false}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div id="content" className={clsx('fixed inset-0 overflow-hidden', styles.border)}>
          <LoadingOverlay visible={connectionState != ConnectionState.CONNECTED} message={loadingMessage} loading={connectionState == ConnectionState.CONNECTING} className="bg-opacity-100" />
          <Col className={clsx('text-ink-0 absolute inset-0 bg-[#212121] leading-[normal]')} style={{ fontSize: 'calc(min(70px, 4.5vw))' }}>
            <Row className="items-center justify-center p-[0.25em] pt-[0.1em]">
              <div id="question" className="shrink grow pr-[0.5em] text-center"></div>
              <Col className="min-w-[5.2em] items-center justify-center justify-self-end">
                <div id="chance" className="text-[2.5em] text-[#A5FF6E] after:content-['%']"></div>
                <div className="-mt-[0.3em] text-[1.0em] text-[#A5FF6E]">chance</div>
              </Col>
            </Row>
            <Col className={clsx('relative min-h-0 shrink grow items-stretch', resolvedData && 'mb-1')}>
              <canvas id="chart" className="absolute" style={{ aspectRatio: 'unset' }}></canvas>
            </Col>
            <Row className={clsx('items-center justify-end p-[0.2em]', resolvedData && 'hidden')}>
              <Col className="h-[3.6em] max-h-[3.6em] shrink grow items-start justify-end overflow-hidden">
                <Col id="transactions" className="h-full shrink grow">
                  <div id="transaction-template" className={clsx(styles.bet, 'text-[1em]')}>
                    <div id="name" className="inline-block max-w-[65%] truncate align-bottom font-bold"></div>{' '}
                    <div className="color inline">
                      <p className="boughtSold"></p> {ENV_CONFIG.moneyMoniker} <p className="amount"></p>
                    </div>
                  </div>
                </Col>
              </Col>
              <Col className="overflow-hidden text-center">
                <div
                  style={{
                    backgroundImage: 'url(logo-white.svg)',
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    aspectRatio: '1',
                    display: 'block',
                    height: '2.0em',
                    transform: 'scale(1.8)',
                  }}
                ></div>
                <div className="text-center text-[1.0em]" style={{ fontWeight: 'bold' }}>
                  !signup
                </div>
              </Col>
            </Row>
          </Col>
          {resolvedData && (
            <>
              <Transition
                as={Fragment}
                show={page == Page.RESOLVED_RESULT}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-300"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Col className="text-ink-0 absolute inset-0 bg-[#212121] leading-[normal]">
                  <Col className="flex grow items-center justify-center text-6xl font-bold">
                    <div>Resolved</div>
                    {resolvedData.outcome === ResolutionOutcome.YES ? (
                      <div className={clsx('mt-1', styles.green, styles.color)}>YES</div>
                    ) : resolvedData.outcome == ResolutionOutcome.NO ? (
                      <div className={clsx('mt-1', styles.red, styles.color)}>NO</div>
                    ) : (
                      <div className={clsx('mt-1', styles.blue, styles.color)}>N/A</div>
                    )}
                  </Col>
                </Col>
              </Transition>
              <Transition
                as={Fragment}
                show={page == Page.RESOLVED_TRADERS}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-300"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Col className="text-ink-0 absolute inset-0 bg-[#212121] p-4 font-bold leading-[normal]">
                  <Row className="justify-between">
                    <Row className="items-center text-3xl">
                      <div>Resolved</div>
                      &nbsp;
                      {resolvedData.outcome == 'YES' ? (
                        <div className={clsx('', styles.green, styles.color)}>YES</div>
                      ) : resolvedData.outcome == 'NO' ? (
                        <div className={clsx('', styles.red, styles.color)}>NO</div>
                      ) : (
                        <div className={clsx('', styles.blue, styles.color)}>N/A</div>
                      )}
                    </Row>
                    <Col className="text-1xl items-center text-center">
                      <div>{resolvedData.uniqueTraders} unique</div>
                      <div>trader{resolvedData.uniqueTraders === 1 ? '' : 's'}!</div>
                    </Col>
                  </Row>
                  <Col className="mt-5 grow text-xl">
                    <div className="text-green-400">Top Winners:</div>
                    <div className="font-normal">
                      {resolvedData.topWinners.map((winner, index) => (
                        <div className="inline" key={index}>
                          {winner.displayName} (+{ENV_CONFIG.moneyMoniker}
                          {Math.round(winner.profit)}){index < resolvedData.topWinners.length - 1 ? ', ' : ''}
                        </div>
                      ))}
                    </div>
                  </Col>
                  <Col className="grow text-xl">
                    <div className="text-red-500">Top Losers:</div>
                    <div className="font-normal">
                      {resolvedData.topLosers.map((loser, index) => (
                        <div className="inline" key={index}>
                          {loser.displayName} (-{ENV_CONFIG.moneyMoniker}
                          {Math.round(Math.abs(loser.profit))}){index < resolvedData.topLosers.length - 1 ? ', ' : ''}
                        </div>
                      ))}
                    </div>
                  </Col>
                </Col>
              </Transition>
            </>
          )}
        </div>
      </Transition>
    </>
  );
};
