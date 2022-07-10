/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import "./style/style.scss";

import { uniqueNamesGenerator, Config, adjectives, colors, animals, countries } from 'unique-names-generator';

class Application {
    readonly transactionTemplate: HTMLElement;

    transactions: HTMLElement[] = [];

    currentProbability: number = 99.1;
    animatedProbability: number = this.currentProbability;

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.removeAttribute("id");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        document.getElementById("question").innerHTML = "Will dogdog get 1st place?";

        let animationFrame = () => {
            this.animatedProbability += (this.currentProbability - this.animatedProbability) * 0.2;
            document.getElementById("chance").innerHTML = this.animatedProbability.toFixed(1);

            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);
        setInterval(() => {
            this.currentProbability = 90 + (10 * Math.random());
        }, 2000);

        this.addTransaction("FoolRxN", 10, true);
        this.addTransaction("Akrolsmir", 100, false);
        this.addTransaction("SirSalty", 1000, true);

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
            this.addTransaction(name, Math.ceil(Math.random() * 10) * Math.pow(10, Math.floor(3 * Math.random())), Math.random() > 0.5);

            setTimeout(addRandomTransaction, randomInt(5000));
        };
        // setTimeout(addRandomTransaction, 1000); !!!

        let lastAddedTimestamp = 0;
        setInterval(() => {
            fetch("/api/transactions")
            .then(r => r.json())
            .then(r => {
                for (let t of r) {
                    if (t.timestamp <= lastAddedTimestamp) {
                        continue;
                    }
                    this.addTransaction(t.name, t.amount, t.yes);
                    lastAddedTimestamp = t.timestamp;
                }
            });
        }, 500);
    }

    addTransaction(name: string, amount: number, yes: boolean) {
        const maxNameLength = 20; //!!! hack
        if (name.length > maxNameLength) {
            name = name.substring(0, maxNameLength - 3);
            name += "...";
        }

        let t = <HTMLElement> this.transactionTemplate.cloneNode(true);
        t.querySelector(".name").innerHTML = name;
        t.querySelector(".amount").innerHTML = amount.toFixed(0);

        let response = document.createElement("p");
        response.classList.add(yes ? "yes" : "no");
        t.appendChild(response);

        document.getElementById("transactions").prepend(t);

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