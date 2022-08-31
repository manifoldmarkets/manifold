export type PacketResolved = {
    outcome: "YES" | "NO" | "NA";
    uniqueTraders: number;
    topWinners: {displayName: string, profit: number}[];
    topLosers: {displayName: string, profit: number}[];
}

export type PacketCreateMarket = {
    question: string;
    groupId: string;
}

export type PacketMarketCreated = {
    id?: string;
    failReason?: string;
}

export type PacketTwitchLinkComplete = {
    twitchName: string;
    controlToken: string;
}

export type PacketUserInfo = {
    manifoldID: string;
}

export type PacketHandshakeComplete = {
    actingManifoldUserID: string;
    manifoldAPIBase: string;
}