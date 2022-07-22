/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import "./style/style.scss";

// import { uniqueNamesGenerator, Config, adjectives, colors, animals, countries } from "unique-names-generator";
import moment from "moment";

import Chart, { Point } from "./chart";

import * as Manifold from "common/manifold-defs";
import { getCanvasFont, getTextWidth } from "common/utils";
import { FullBet } from "common/transaction";

import io from "socket.io-client";

const APIBase = "https://dev.manifold.markets/api/v0/";

class BetElement {
    bet: FullBet;
    element: HTMLDivElement;
}

class Application {
    readonly transactionTemplate: HTMLElement;
    readonly chart: Chart;

    betElements: BetElement[] = [];

    currentProbability_percent = 0;
    animatedProbability_percent: number = this.currentProbability_percent;

    currentMarket: Manifold.LiteMarket = null;

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.removeAttribute("id");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        this.chart = new Chart(<HTMLCanvasElement>document.getElementById("chart"));

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

        // Update bet times:
        setInterval(() => this.updateBetTimes(), 1000);

        // const addRandomTransaction = () => {
        //     const customConfig: Config = {
        //         dictionaries: [adjectives, colors, animals, countries],
        //         separator: "",
        //         length: 2,
        //         style: "capital",
        //     };
        //     let numWords = randomInt(2) + 1;
        //     while (customConfig.dictionaries.length > numWords) {
        //         customConfig.dictionaries.splice(randomInt(customConfig.dictionaries.length - 1), 1);
        //     }
        //     customConfig.length = customConfig.dictionaries.length;
        //     let name = uniqueNamesGenerator(customConfig);
        //     name = name.replace(/ /g, ""); // Remove all whitespace
        //     //!!! this.addBet(new Transaction(name, Math.ceil(Math.random() * 10) * Math.pow(10, Math.floor(3 * Math.random())), Math.random() > 0.5, Date.now()));

        //     setTimeout(addRandomTransaction, randomInt(5000));
        // };
        // setTimeout(addRandomTransaction, 1000);

        this.loadMarket("this-is-a-local-market");
        // this.loadBettingHistory();

        // let lastAddedTimestamp = 0;
        const socket = io();
        socket.on("bets", (bets: FullBet[]) => {
            // console.log(bet);
            // bets.reverse();
            for (const bet of bets) {
                // if (bet.createdTime <= lastAddedTimestamp) {
                //     continue;
                // }
                this.addBet(bet);
                // lastAddedTimestamp = bet.createdTime;
            }
        });
        socket.on("clear", () => {
            this.chart.data = [];
            for (const bet of this.betElements) {
                bet.element.parentElement.removeChild(bet.element);
            }
            this.betElements = [];
        })
    }

    updateBetTimes() {
        this.betElements.forEach((t) => {
            t.element.querySelector(".time").innerHTML = moment(t.bet.createdTime).fromNow();
        });
    }

    loadMarket(slug: string) {
        fetch(`${APIBase}slug/${slug}`)
            .then((r) => <Promise<Manifold.LiteMarket>>r.json())
            .then((market) => {
                this.currentMarket = market;
                this.currentMarket["slug"] = slug;

                document.getElementById("question").innerHTML = this.currentMarket.question;
                this.currentProbability_percent = this.currentMarket.probability * 100;
                this.animatedProbability_percent = this.currentProbability_percent;
                console.log(market);

                document.getElementById("spinner").style.display = "none";
                document
                    .getElementById("chance")
                    .parentElement.querySelectorAll("div")
                    .forEach((r) => (r.style.visibility = ""));

                this.loadBettingHistory();
            })
            .catch((e) => {
                console.error(e);
            });
    }

    loadBettingHistory() {
        fetch(`${APIBase}bets?market=${this.currentMarket["slug"]}&limit=1000`)
            .then((r) => <Promise<Manifold.Bet[]>>r.json())
            .then((r) => {
                const data: Point[] = [];
                r.reverse(); // Data is returned in newest-first fashion and must be pushed in oldest-first
                for (const t of r) {
                    data.push(new Point(t.createdTime, t.probBefore));
                    data.push(new Point(t.createdTime, t.probAfter));
                }
                this.chart.data = data;
            })
            .catch((r) => {
                console.error(r);
            });
    }

    addBet(bet: FullBet) {
        // const maxNameLength = 20; //!!! hack
        let name = bet.username; //!!!
        // if (name.length > maxNameLength) {
        //     name = name.substring(0, maxNameLength - 3);
        //     name += "...";
        // }

        const betAmountMagnitude = Math.abs(Math.ceil(bet.amount));

        let positiveBet = false;
        if (bet.amount > 0 && bet.outcome == "YES") {
            positiveBet = true;
        }

        const t = <HTMLDivElement>this.transactionTemplate.cloneNode(true);
        document.getElementById("transactions").prepend(t);
        //
        const nameDiv = <HTMLElement>t.querySelector(".name");
        const divFont = getCanvasFont(nameDiv);
        let isTruncated = false;
        while (getTextWidth(name + (isTruncated ? "..." : ""), divFont) > 400) {
            name = name.substring(0, name.length - 1);
            isTruncated = true;
        }
        nameDiv.innerHTML = name + (isTruncated ? "..." : "");
        //
        t.querySelector(".amount").innerHTML = betAmountMagnitude.toFixed(0);
        t.querySelector(".boughtSold").innerHTML = positiveBet ? "+" : "-";
        t.querySelector(".color").classList.add(positiveBet? "green" : "red");

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
            t.classList.add("show");
        }, 1);

        if (this.betElements.length > 3) {
            const transactionToRemove = this.betElements.shift().element;
            transactionToRemove.classList.remove("show");
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

        this.updateBetTimes();
    }
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
}

document.addEventListener("DOMContentLoaded", () => setTimeout(() => new Application(), 1));
