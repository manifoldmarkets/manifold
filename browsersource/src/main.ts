/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import "./style/style.scss";

import { uniqueNamesGenerator, Config, adjectives, colors, animals, countries } from 'unique-names-generator';

import Chart, { Point } from "./chart";

import Manifold from "common/manifold-defs";
import { getCanvasFont, getCssStyle, getTextWidth } from "common/utils";
import { FullBet } from "common/transaction";

const APIBase = "https://dev.manifold.markets/api/v0/";

class Application {
    readonly transactionTemplate: HTMLElement;
    readonly chart: Chart;

    transactions: HTMLElement[] = [];

    currentProbability_percent: number = 99.1;
    animatedProbability_percent: number = this.currentProbability_percent;

    currentMarket: Manifold.LiteMarket = null;

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.removeAttribute("id");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        this.chart = new Chart(<HTMLCanvasElement> document.getElementById("chart"));

        document.getElementById("question").innerHTML = "";

        //!!! This all needs to move to another polling system for the market probability:
        let animationFrame = () => {
            this.animatedProbability_percent += (this.currentProbability_percent - this.animatedProbability_percent) * 0.2;
            document.getElementById("chance").innerHTML = this.animatedProbability_percent.toFixed(0);

            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);
        // setInterval(() => {
        //     this.currentProbability_percent = 90 + (10 * Math.random());
        // }, 2000);

        const addRandomTransaction = () => {
            const customConfig: Config = {
                dictionaries: [adjectives, colors, animals, countries],
                separator: '',
                length: 2,
                style: "capital"
            };
            let numWords = randomInt(2) + 1;
            while (customConfig.dictionaries.length > numWords) {
                customConfig.dictionaries.splice(randomInt(customConfig.dictionaries.length - 1), 1);
            }
            customConfig.length = customConfig.dictionaries.length;
            let name = uniqueNamesGenerator(customConfig);
            name = name.replace(/ /g,""); // Remove all whitespace
            //!!! this.addBet(new Transaction(name, Math.ceil(Math.random() * 10) * Math.pow(10, Math.floor(3 * Math.random())), Math.random() > 0.5, Date.now()));

            setTimeout(addRandomTransaction, randomInt(5000));
        };
        // setTimeout(addRandomTransaction, 1000); !!!

        let lastAddedTimestamp = 0;
        setInterval(() => {
            fetch("/api/transactions")
            .then(r => <Promise<FullBet[]>> r.json())
            .then(bets => {
                bets.reverse();
                for (const bet of bets) {
                    if (bet.createdTime <= lastAddedTimestamp) {
                        continue;
                    }
                    this.addBet(bet);
                    lastAddedTimestamp = bet.createdTime;
                }
            });
        }, 500);

        this.loadMarket("this-is-a-local-market");
        // this.loadBettingHistory();
    }

    loadMarket(slug: string) {
        fetch(`${APIBase}slug/${slug}`)
        .then(r => <Promise<Manifold.LiteMarket>> r.json())
        .then(market => {
            this.currentMarket = market;
            this.currentMarket["slug"] = slug;

            document.getElementById("question").innerHTML = this.currentMarket.question;
            this.currentProbability_percent = this.currentMarket.probability * 100;
            this.animatedProbability_percent = this.currentProbability_percent;
            console.log(market)

            document.getElementById("spinner").style.display = "none";
            document.getElementById("chance").parentElement.querySelectorAll("div").forEach(r => r.style.visibility = "");

            this.loadBettingHistory();
        })
        .catch(e => {
            console.error(e);
        });
    }

    loadBettingHistory() {
        fetch(`${APIBase}bets?market=${this.currentMarket["slug"]}&limit=1000`)
        .then(r => <Promise<Manifold.Bet[]>> r.json())
        .then(r => {
            let data: Point[] = [];
            r.reverse(); // Data is returned in newest-first fashion and must be pushed in oldest-first
            for (let t of r) {
                data.push(new Point(t.createdTime, t.probBefore));
                data.push(new Point(t.createdTime, t.probAfter));
            }
            this.chart.data = data;
        })
        .catch(r => {
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

        let betAmountMagnitude = Math.abs(bet.amount);

        let t = <HTMLElement> this.transactionTemplate.cloneNode(true);
        document.getElementById("transactions").prepend(t);
        //
        let nameDiv = <HTMLElement> t.querySelector(".name");
        let divFont = getCanvasFont(nameDiv);
        let isTruncated = false;
        while (getTextWidth(name + (isTruncated ? "..." : ""), divFont) > 400) {
            name = name.substring(0, name.length - 1);
            isTruncated = true;
        }
        nameDiv.innerHTML = name + (isTruncated ? "..." : "");
        //
        t.querySelector(".amount").innerHTML = betAmountMagnitude.toFixed(0);
        t.querySelector(".boughtSold").innerHTML = bet.amount > 0 ? "bought" : "sold";

        let response = document.createElement("p");
        response.classList.add(bet.outcome == "YES" ? "yes" : "no");
        t.appendChild(response);

        // t.innerHTML = bet.displayText; //!!! REMOVE


        this.transactions.push(t);
        t.offsetLeft;
        setTimeout(() => {
            t.classList.add("show");
        }, 1);

        if (this.transactions.length > 3) {
            let transactionToRemove = this.transactions.shift();
            transactionToRemove.classList.remove("show");
            setTimeout(() => {
                transactionToRemove.parentElement.removeChild(transactionToRemove);
            }, 500);
        }
    }
}

function randomInt(maxInclusive: number): number {
    return Math.floor(Math.random() * (maxInclusive + 1));
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}

document.addEventListener("DOMContentLoaded", () => setTimeout(() => new Application(), 1));