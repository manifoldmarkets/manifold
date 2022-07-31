import * as ManifoldAPI from "common/manifold-defs";
import fetch, { Response } from "node-fetch";
import { InsufficientBalanceException } from "./exceptions";

const APIBase = "https://dev.manifold.markets/api/v0/";

async function post(url: string, apiKey: string, requestData: unknown): Promise<Response> {
    return await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(requestData),
    }).then(async (r) => {
        if (r.status !== 200) {
            const error = <{ message: string }>await r.json();
            const errorMessage = error.message;
            if (errorMessage === "Insufficient balance.") throw new InsufficientBalanceException();
            if (errorMessage === "Balance must be at least 100.") throw new InsufficientBalanceException();
            throw new Error(error.message);
        }
        return r;
    });
}

export async function getUserByID(userID: string): Promise<ManifoldAPI.LiteUser> {
    return <ManifoldAPI.LiteUser>await (await fetch(`${APIBase}user/by-id/${userID}`)).json();
}

export async function getUserByManifoldUsername(manifoldUsername: string): Promise<ManifoldAPI.LiteUser> {
    return <ManifoldAPI.LiteUser>await (await fetch(`${APIBase}user/${manifoldUsername}`)).json();
}

export async function sellShares(marketID: string, APIKey: string, outcome: "YES" | "NO" | number): Promise<Response> {
    return await post(`${APIBase}market/${marketID}/sell`, APIKey, { outcome: outcome });
}

export async function createBinaryMarket(APIKey: string, question: string, description: string, initialProb_percent: number): Promise<ManifoldAPI.LiteMarket> {
    const outcomeType: "BINARY" | "FREE_RESPONSE" | "NUMERIC" = "BINARY";
    const descriptionObject = {
        type: "doc",
        content: [
            ...(description
                ? [
                      {
                          type: "paragraph",
                          content: [
                              {
                                  type: "text",
                                  text: question,
                              },
                          ],
                      },
                  ]
                : []),
        ],
    };
    const requestData = {
        outcomeType: outcomeType,
        question: question,
        description: descriptionObject,
        closeTime: Date.now() + 1e12, // Arbitrarily long time in the future
        initialProb: initialProb_percent,
    };
    return <ManifoldAPI.LiteMarket>await (await post(`${APIBase}market`, APIKey, requestData)).json();
}

export async function resolveBinaryMarket(marketID: string, APIKey: string, outcome: ManifoldAPI.ResolutionOutcome): Promise<Response> {
    return await post(`${APIBase}market/${marketID}/resolve`, APIKey, { outcome: outcome });
}

export async function placeBet(marketID: string, APIKey: string, amount: number, outcome: "YES" | "NO"): Promise<Response> {
    const requestData = {
        amount: amount,
        contractId: marketID,
        outcome: outcome,
    };
    return await post(`${APIBase}bet`, APIKey, requestData);
}
