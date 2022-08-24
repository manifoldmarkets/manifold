/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import styles from "../styles/overlay.module.scss";

import moment from "moment";

import Chart, { Point } from "../components/chart";

import { getCanvasFont, getTextWidth } from "../lib/utils";

import io, { Socket } from "socket.io-client";
import { Col } from "web/components/layout/col";
import { Fragment, useEffect, useState } from "react";
import Head from "next/head";
import { Row } from "web/components/layout/row";
import clsx from "clsx";
import { Transition } from "@headlessui/react";

import * as Manifold from "common/manifold-defs";
import * as Packet from "common/packet-ids";
import { FullBet } from "common/transaction";
import { PacketResolved } from "common/packets";
import { ConnectionState } from "web/lib/connection-state";
import { LoadingOverlay } from "web/components/loading-overlay";

const APIBase = "https://dev.manifold.markets/api/v0/";

class BetElement {
    bet: FullBet;
    element: HTMLDivElement;
}

class Application {
    readonly transactionTemplate: HTMLElement;
    readonly chart: Chart;
    readonly socket: Socket;

    betElements: BetElement[] = [];

    currentProbability_percent = 0;
    animatedProbability_percent: number = this.currentProbability_percent;

    currentMarket: Manifold.LiteMarket = null;

    loadedHistory: boolean;
    betsToAddOnceLoadedHistory: FullBet[];

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.removeAttribute("id");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        this.chart = new Chart(document.getElementById("chart") as HTMLCanvasElement);

        this.resetUI();

        moment.relativeTimeThreshold("s", 60);
        moment.updateLocale("en", {
            relativeTime: {
                future: "in %s",
                past: "%s",
                s: "%ds",
                ss: "%ss",
                m: "1m",
                mm: "%dm",
                h: "1h",
                hh: "%dh",
                d: "1d",
                dd: "%dd",
                M: "1m",
                MM: "%dM",
                y: "1y",
                yy: "%dY",
            },
        });

        //!!! This all needs to move to another polling system for the market probability:
        const animationFrame = () => {
            this.animatedProbability_percent += (this.currentProbability_percent - this.animatedProbability_percent) * 0.1;
            document.getElementById("chance").innerHTML = this.animatedProbability_percent.toFixed(0);

            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);

        const params = new Proxy(new URLSearchParams(window.location.search), {
            get: (searchParams, prop) => searchParams.get(prop as string),
        });
        this.socket = io({ query: { type: "overlay", controlToken: params["t"] } });
        this.registerPacketHandlers();
    }

    registerPacketHandlers() {
        this.socket.on(Packet.ADD_BETS, (bets: FullBet[]) => {
            for (const bet of bets) {
                if (this.loadedHistory) {
                    this.addBet(bet);
                } else {
                    this.betsToAddOnceLoadedHistory.push(bet);
                }
            }
        });
        this.socket.on(Packet.SELECT_MARKET_ID, (marketID: string) => {
            this.resetUI();
            this.loadMarketByID(marketID);
        });
        this.socket.on(Packet.CLEAR, () => {
            this.resetUI();

            this.chart.data = [];
            for (const bet of this.betElements) {
                bet.element.parentElement.removeChild(bet.element);
            }
            this.betElements = [];
        });
    }

    resetUI() {
        document.getElementById("question").innerHTML = "";
        document.getElementById("spinner").style.display = "";
        this.chart.canvasElement.style.display = "none";
        this.chart.data = [];
        document
            .getElementById("chance")
            .parentElement.querySelectorAll("div")
            .forEach((r) => {
                if (r.id !== "spinner") r.classList.add("invisible");
            });
        this.betElements.forEach((b) => {
            b?.element?.remove();
        });
        this.betElements = [];

        this.loadedHistory = false;
        this.betsToAddOnceLoadedHistory = [];
    }

    loadMarketByID(id: string) {
        fetch(`${APIBase}market/${id}/lite`)
            .then((r) => r.json() as Promise<Manifold.LiteMarket>)
            .then((market) => {
                this.currentMarket = market;
                this.currentMarket["slug"] = this.currentMarket.url.substring(this.currentMarket.url.lastIndexOf("/") + 1, this.currentMarket.url.length); //!!!

                document.getElementById("question").innerHTML = this.currentMarket.question;
                this.currentProbability_percent = this.currentMarket.probability * 100;
                this.animatedProbability_percent = this.currentProbability_percent;
                console.log(market);

                document.getElementById("spinner").style.display = "none";
                document
                    .getElementById("chance")
                    .parentElement.querySelectorAll("div")
                    .forEach((r) => r.classList.remove("invisible"));

                this.loadBettingHistory();

                this.chart.resize();
            })
            .catch((e) => {
                console.error(e);
            });
    }

    async loadBettingHistory() {
        await fetch(`${APIBase}bets?market=${this.currentMarket["slug"]}&limit=1000`) //!!! Doesn't load entire history
            .then((r) => r.json() as Promise<Manifold.Bet[]>)
            .then((r) => {
                const data: Point[] = [];
                r.reverse(); // Data is returned in newest-first fashion and must be pushed in oldest-first
                for (const t of r) {
                    data.push(new Point(t.createdTime, t.probBefore));
                    data.push(new Point(t.createdTime, t.probAfter));
                }
                this.chart.data = data;

                for (const bet of this.betsToAddOnceLoadedHistory) {
                    this.addBet(bet);
                }

                this.chart.canvasElement.style.display = "";

                this.loadedHistory = true;
            })
            .catch(console.error);
    }

    addBet(bet: FullBet) {
        console.debug("Add bet");

        let name = bet.username;

        const betAmountMagnitude = Math.abs(Math.ceil(bet.amount));

        let positiveBet = false;
        if ((bet.amount > 0 && bet.outcome == "YES") || (bet.amount < 0 && bet.outcome == "NO")) {
            positiveBet = true;
        }

        const t = this.transactionTemplate.cloneNode(true) as HTMLDivElement;
        document.getElementById("transactions").prepend(t);
        //
        const nameDiv = t.querySelector(".name") as HTMLElement;
        const divFont = getCanvasFont(nameDiv);
        let isTruncated = false;
        while (getTextWidth(name + (isTruncated ? "..." : ""), divFont) > 400) {
            name = name.substring(0, name.length - 1);
            isTruncated = true;
        }
        nameDiv.innerHTML = name + (isTruncated ? "..." : "");
        //
        t.querySelector(".amount").innerHTML = betAmountMagnitude.toFixed(0);
        t.querySelector(".boughtSold").innerHTML = (bet.amount < 0 ? "sold " : "") + ((bet.amount < 0 ? !positiveBet : positiveBet) ? "YES" : "NO");
        (t.querySelector(".color") as HTMLElement).style.color = positiveBet ? "#92ff83" : "#ff3d3d";

        const response = document.createElement("p");
        // response.classList.add(bet.outcome == "YES" ? "yes" : "no");
        t.appendChild(response);

        // t.innerHTML = bet.displayText; //!!! REMOVE

        const betElement = new BetElement();
        betElement.element = t;
        betElement.bet = bet;

        this.betElements.push(betElement);
        t.offsetLeft;
        setTimeout(() => {
            t.classList.add("!h-[1.2em]");
        }, 1);

        if (this.betElements.length > 3) {
            const transactionToRemove = this.betElements.shift().element;
            transactionToRemove.classList.remove("!h-[1.2em]");
            setTimeout(() => {
                transactionToRemove.parentElement.removeChild(transactionToRemove);
            }, 500);
        }

        if (this.currentMarket) {
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
    const [loadingMessage, setLoadingMessage] = useState("Connecting to server...");
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.CONNECTING);

    useEffect(() => {
        const app = new Application();
        app.socket.on("connect_error", (err) => {
            console.error(err);
            if (err.message !== "xhr poll error") {
                setLoadingMessage(err.message);
                setConnectionState(ConnectionState.FAILED);
            }
        });
        app.socket.on("connect", () => {
            console.debug("Socked connected to server.");
            setConnectionState(ConnectionState.CONNECTED);
        });
        app.socket.on("disconnect", () => {
            setLoadingMessage("Connecting to server...");
            setConnectionState(ConnectionState.CONNECTING);
        });
        app.socket.on(Packet.RESOLVE, (packet: PacketResolved) => {
            setResolvedData(packet);
        });
        app.socket.on(Packet.CLEAR, () => {
            setResolvedData(undefined);
            setOverlayVisible(false);
            console.debug("Received clear packet");
        });
        app.socket.on(Packet.SELECT_MARKET_ID, (marketID: string) => {
            setResolvedData(undefined);
            setOverlayVisible(marketID ? true : false);
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
                    console.log("Change page: " + page);
                    switch (page) {
                        case Page.RESOLVED_RESULT:
                            return Page.RESOLVED_TRADERS;
                        case Page.RESOLVED_TRADERS:
                            return Page.RESOLVED_GRAPH;
                        case Page.RESOLVED_GRAPH:
                            return Page.RESOLVED_TRADERS;
                        default:
                            throw new Error("Unhandled case: " + page);
                    }
                });
            }, 4000);
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
                enter="ease-out duration-300 delay-500"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-300"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
            >
                <div id="content" className={clsx("fixed inset-0 overflow-hidden", styles.border)}>
                    <LoadingOverlay
                        visible={connectionState != ConnectionState.CONNECTED}
                        message={loadingMessage}
                        loading={connectionState == ConnectionState.CONNECTING}
                        className="bg-opacity-100"
                    />
                    <Col className={clsx("absolute text-white bg-[#212121] leading-[normal] inset-0")} style={{ fontSize: "calc(min(70px, 4.5vw))" }}>
                        <Row className="items-center justify-center p-[0.25em] pt-[0.1em]">
                            <div id="question" className="pr-[0.5em] grow shrink text-center"></div>
                            <Col className="items-center justify-center justify-self-end">
                                <div id="chance" className="after:content-['%'] text-[1.5em] text-[#A5FF6E] invisible"></div>
                                <div className="-mt-[0.3em] text-[0.7em] text-[#A5FF6E] invisible">chance</div>
                                <div id="spinner" className={clsx("absolute", styles.spinner)}></div>
                            </Col>
                        </Row>
                        <Col className={clsx("relative grow shrink items-stretch min-h-0", resolvedData && "mb-1")}>
                            <canvas id="chart" className="absolute" style={{ aspectRatio: "unset" }}></canvas>
                        </Col>
                        <Row className={clsx("justify-end items-center p-[0.2em]", resolvedData && "hidden")}>
                            <Col id="transactions" className="grow shrink h-full items-start justify-end">
                                <div id="transaction-template" className={styles.bet}>
                                    <div className="name font-bold"></div>
                                    &nbsp;
                                    <div className="color">
                                        <p className="boughtSold"></p> M$<p className="amount">1000</p>
                                    </div>
                                </div>
                            </Col>
                            <Col className="text-center">
                                <div
                                    style={{
                                        backgroundImage: "url(logo-white.svg)",
                                        backgroundSize: "contain",
                                        backgroundRepeat: "no-repeat",
                                        backgroundPosition: "center",
                                        aspectRatio: "1",
                                        display: "block",
                                        height: "1.5em",
                                    }}
                                ></div>
                                <div className="text-[0.4em] whitespace-nowrap" style={{ fontFamily: "Major Mono Display, monospace" }}>
                                    manifold
                                    <br />
                                    markets
                                </div>
                                <div className="text-center text-[0.7em]" style={{ fontWeight: "bold" }}>
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
                                        {resolvedData.outcome == "YES" ? (
                                            <div className={clsx("mt-1", styles.green, styles.color)}>YES</div>
                                        ) : resolvedData.outcome == "NO" ? (
                                            <div className={clsx("mt-1", styles.red, styles.color)}>NO</div>
                                        ) : (
                                            <div className={clsx("mt-1", styles.blue, styles.color)}>N/A</div>
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
                                        <Row className="items-center text-4xl">
                                            <div>Resolved</div>
                                            &nbsp;
                                            {resolvedData.outcome == "YES" ? (
                                                <div className={clsx("", styles.green, styles.color)}>YES</div>
                                            ) : resolvedData.outcome == "NO" ? (
                                                <div className={clsx("", styles.red, styles.color)}>NO</div>
                                            ) : (
                                                <div className={clsx("", styles.blue, styles.color)}>N/A</div>
                                            )}
                                        </Row>
                                        <Col className="items-center text-1xl">
                                            <div>{resolvedData.uniqueTraders} unique</div>
                                            <div>trader{resolvedData.uniqueTraders === 1 ? "" : "s"}!</div>
                                        </Col>
                                    </Row>
                                    <Col className="grow mt-5 text-xl">
                                        <div className="text-green-400">Top Winners:</div>
                                        <div className="font-normal">
                                            {resolvedData.topWinners.map((winner, index) => (
                                                <div className="inline" key={index}>
                                                    {winner.displayName} (+M${Math.round(winner.profit)}){index < resolvedData.topWinners.length - 1 ? ", " : ""}
                                                </div>
                                            ))}
                                        </div>
                                    </Col>
                                    <Col className="grow text-xl">
                                        <div className="text-red-500">Top Losers:</div>
                                        <div className="font-normal">
                                            {resolvedData.topLosers.map((loser, index) => (
                                                <div className="inline" key={index}>
                                                    {loser.displayName} (-M${Math.round(Math.abs(loser.profit))}){index < resolvedData.topLosers.length - 1 ? ", " : ""}
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
