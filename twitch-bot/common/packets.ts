import { ResolutionOutcome } from './outcome';
import { AbstractMarket, NamedBet } from './types/manifold-abstract-types';

export type PacketResolved = {
  outcome: ResolutionOutcome;
  uniqueTraders: number;
  topWinners: { displayName: string; profit: number }[];
  topLosers: { displayName: string; profit: number }[];
};

export type PacketCreateMarket = {
  question: string;
  groupId: string;
};

export type PacketMarketCreated = {
  id?: string;
  failReason?: string;
};

export type PacketTwitchLinkComplete = {
  twitchName: string;
  controlToken: string;
};

export type PacketUserInfo = {
  manifoldID: string;
};

export type PacketHandshakeComplete = {
  actingManifoldUserID: string;
  manifoldAPIBase: string;
  serverID: string;
};

export type PacketSelectMarket = AbstractMarket & {
  initialBets: NamedBet[];
};

export type GroupControlField = { url: string; valid: boolean; affectedUserName?: string };

export type PacketGroupControlFields = {
  fields: GroupControlField[];
};
