/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import "./style/style.scss";

import { uniqueNamesGenerator, Config, adjectives, colors, animals } from 'unique-names-generator';

class Application {
    readonly transactionTemplate: HTMLElement;

    transactions: HTMLElement[] = [];

    currentProbability: number = 99.1;
    animatedProbability: number = this.currentProbability;

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        let animationFrame = () => {
            this.animatedProbability += (this.currentProbability - this.animatedProbability) * 0.2;
            document.getElementById("chance").innerHTML = this.animatedProbability.toFixed(1);

            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);
        setInterval(() => {
            this.currentProbability = 90 + (10 * Math.random());
        }, 2000);

        const customConfig: Config = {
            dictionaries: [adjectives, colors],
            separator: '',
            length: 2,
            style: "capital"
        };

        this.addTransaction("FoolRxN", 10, true);
        this.addTransaction("Akrolsmir", 100, false);
        this.addTransaction("SirSalty", 1000, true);

        setInterval(() => {
            let name = uniqueNamesGenerator(customConfig);
            name = name.substring(0, Math.min(name.length, 10) - 1);
            this.addTransaction(name, Math.ceil(Math.random() * 10) * Math.pow(10, Math.floor(3 * Math.random())), Math.random() > 0.5);
        }, 5000);
    }

    addTransaction(name: string, amount: number, yes: boolean) {
        let t = <HTMLElement> this.transactionTemplate.cloneNode(true);
        t.querySelector(".name").innerHTML = name;
        t.querySelector(".amount").innerHTML = amount.toFixed(0);

        let response = document.createElement("p");
        response.classList.add(yes ? "yes" : "no");
        t.appendChild(response);

        document.getElementById("transactions").prepend(t);

        this.transactions.push(t);
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}

document.addEventListener("DOMContentLoaded", () => setTimeout(() => new Application(), 1));