import { ResolutionOutcome } from './outcome';
import { AbstractMarket, NamedBet } from './types/manifold-abstract-types';
import { Contract, Group } from './types/manifold-internal-types';

export class Packet {}

export class PacketResolved extends Packet {
  outcome: ResolutionOutcome;
  uniqueTraders: number;
  topWinners: { displayName: string; profit: number }[];
  topLosers: { displayName: string; profit: number }[];
  static getName() {
    return 'resolved';
  }
}

export class PacketRequestResolve extends Packet {
  outcomeString: string; //!!! Migrate to enum
  static getName() {
    return 'resolve';
  }
}

export class PacketAddBets extends Packet {
  bets: NamedBet[];
  static getName() {
    return 'addbets';
  }
}

export class PacketClear extends Packet {
  static getName() {
    return 'clear';
  }
}

export class PacketCreateMarket extends Packet {
  question: string;
  groupId: string;
  static getName() {
    return 'create';
  }
}

export class PacketMarketCreated extends Packet {
  id?: string;
  failReason?: string;
  static getName() {
    return 'marketcreated';
  }
}

export class PacketUserInfo extends Packet {
  manifoldID: string;
  static getName() {
    return 'userinfo';
  }
}

export class PacketHandshakeComplete extends Packet {
  actingManifoldUserID: string;
  manifoldAPIBase: string;
  serverID: string;
  isAdmin: boolean;
  static getName() {
    return 'handshakecomplete';
  }
}

export class PacketSelectMarket extends Packet {
  market: AbstractMarket;
  initialBets: NamedBet[];
  static getName() {
    return 'selectmarket';
  }
}

export class PacketSelectMarketID extends Packet {
  id: string;
  static getName() {
    return 'selectmarketid';
  }
}

export class PacketUnfeature extends Packet {
  static getName() {
    return 'unfeaturemarket';
  }
}

export class PacketPing extends Packet {
  static getName() {
    return 'ping';
  }
}

export class PacketPong extends Packet {
  static getName() {
    return 'pong';
  }
}

export class PacketGroups extends Packet {
  groups: Group[];
  static getName() {
    return 'groups';
  }
}

export class PacketRequestGroups extends Packet {
  static getName() {
    return 'requestgroups';
  }
}

export class PacketRequestContractsInGroup extends Packet {
  groupId: string;
  static getName() {
    return 'requestcontractsingroup';
  }
}

export class PacketContractsInGroup extends Packet {
  groupID: string;
  contracts: Contract[];
  static getName() {
    return 'contractsingroup';
  }
}

export type GroupControlField = {
  url: string;
  valid: boolean;
  affectedUserName?: string;
};

export class PacketGroupControlFields extends Packet {
  fields: GroupControlField[];
  static getName() {
    return 'groupcontrolfields';
  }
}
