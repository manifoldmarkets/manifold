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

import { ResolutionOutcome } from 'common/outcome';
import * as Packet from 'common/packet-ids';
import { PacketResolved, PacketSelectMarket } from 'common/packets';
import { AbstractMarket, NamedBet } from 'common/types/manifold-abstract-types';
import { DisconnectDescription } from 'socket.io-client/build/esm/socket';
import { LoadingOverlay } from 'web/components/loading-overlay';
import { ConnectionState } from 'web/lib/connection-state';

class BetElement {
  bet: NamedBet;
  element: HTMLDivElement;
}

class Application {
  readonly transactionTemplate: HTMLElement;
  readonly chart: Chart;
  readonly socket: Socket;

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
    this.socket.on(Packet.ADD_BETS, (bets: NamedBet[]) => {
      try {
        for (const bet of bets) {
          this.addBet(bet);
        }
      } catch (e) {
        console.trace(e);
      }
    });
    this.socket.on(Packet.SELECT_MARKET, (p: PacketSelectMarket) => {
      console.debug(p);
      try {
        this.resetUI();
        this.loadMarket(p);
      } catch (e) {
        console.trace(e);
      }
    });
    this.socket.on(Packet.CLEAR, () => {
      this.resetUI();
    });
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
    this.currentMarket = { ...p };

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
    if (p.bets.length > 0) {
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
    app.socket.on(Packet.RESOLVE, (packet: PacketResolved) => {
      setResolvedData(packet);
    });
    app.socket.on(Packet.CLEAR, () => {
      setResolvedData(undefined);
      setOverlayVisible(false);
    });
    app.socket.on(Packet.SELECT_MARKET, () => {
      setResolvedData(undefined);
      setOverlayVisible(true);
    });
    app.socket.on(Packet.UNFEATURE_MARKET, () => {
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
          <Col className={clsx('absolute text-white bg-[#212121] leading-[normal] inset-0')} style={{ fontSize: 'calc(min(70px, 4.5vw))' }}>
            <Row className="items-center justify-center p-[0.25em] pt-[0.1em]">
              <div id="question" className="pr-[0.5em] grow shrink text-center"></div>
              <Col className="items-center justify-center justify-self-end min-w-[5.2em]">
                <div id="chance" className="after:content-['%'] text-[2.5em] text-[#A5FF6E]"></div>
                <div className="-mt-[0.3em] text-[1.0em] text-[#A5FF6E]">chance</div>
              </Col>
            </Row>
            <Col className={clsx('relative grow shrink items-stretch min-h-0', resolvedData && 'mb-1')}>
              <canvas id="chart" className="absolute" style={{ aspectRatio: 'unset' }}></canvas>
            </Col>
            <Row className={clsx('justify-end items-center p-[0.2em]', resolvedData && 'hidden')}>
              <Col className="grow shrink items-start justify-end max-h-[3.6em] h-[3.6em] overflow-hidden">
                <Col id="transactions" className="grow shrink h-full">
                  <div id="transaction-template" className={clsx(styles.bet, 'text-[1em]')}>
                    <div id="name" className="font-bold inline-block truncate max-w-[65%] align-bottom"></div>{' '}
                    <div className="color inline">
                      <p className="boughtSold"></p> M$ <p className="amount"></p>
                    </div>
                  </div>
                </Col>
              </Col>
              <Col className="text-center">
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
                {/* <div className="text-[0.4em] whitespace-nowrap" style={{ fontFamily: "Major Mono Display, monospace" }}>
                                    manifold
                                    <br />
                                    markets
                                </div> */}
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
                <Col className="absolute text-white bg-[#212121] leading-[normal] inset-0">
                  <Col className="flex items-center text-6xl justify-center font-bold grow">
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
                <Col className="absolute text-white bg-[#212121] leading-[normal] inset-0 p-4 font-bold">
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
                    <Col className="items-center text-1xl text-center">
                      <div>{resolvedData.uniqueTraders} unique</div>
                      <div>trader{resolvedData.uniqueTraders === 1 ? '' : 's'}!</div>
                    </Col>
                  </Row>
                  <Col className="grow mt-5 text-xl">
                    <div className="text-green-400">Top Winners:</div>
                    <div className="font-normal">
                      {resolvedData.topWinners.map((winner, index) => (
                        <div className="inline" key={index}>
                          {winner.displayName} (+M${Math.round(winner.profit)}){index < resolvedData.topWinners.length - 1 ? ', ' : ''}
                        </div>
                      ))}
                    </div>
                  </Col>
                  <Col className="grow text-xl">
                    <div className="text-red-500">Top Losers:</div>
                    <div className="font-normal">
                      {resolvedData.topLosers.map((loser, index) => (
                        <div className="inline" key={index}>
                          {loser.displayName} (-M${Math.round(Math.abs(loser.profit))}){index < resolvedData.topLosers.length - 1 ? ', ' : ''}
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
