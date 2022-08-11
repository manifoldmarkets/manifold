export class PacketResolved {
    outcome: "YES" | "NO" | "NA";
    uniqueTraders: number;
    topWinners: {displayName: string, profit: number}[];
    topLosers: {displayName: string, profit: number}[];
}

export class PacketCreateMarket {
    question: string;
    groupId: string;
}

export class PacketMarketCreated {
    id: string;
}