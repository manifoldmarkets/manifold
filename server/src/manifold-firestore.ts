import { initializeApp } from 'firebase/app';
import { collection, CollectionReference, doc, DocumentReference, DocumentSnapshot, getFirestore, onSnapshot } from 'firebase/firestore';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';

type Contract = {
  id: string;
  slug: string; // auto-generated; must be unique

  creatorId: string;
  creatorName: string;
  creatorUsername: string;
  creatorAvatarUrl?: string;

  question: string;
  // description: string | JSONContent; // More info about what the contract is about
  tags: string[];
  lowercaseTags: string[];
  // visibility: visibility

  createdTime: number; // Milliseconds since epoch
  lastUpdatedTime?: number; // Updated on new bet or comment
  lastBetTime?: number;
  lastCommentTime?: number;
  closeTime?: number; // When no more trading is allowed

  isResolved: boolean;
  resolutionTime?: number; // When the contract creator resolved the market
  resolution?: string;
  resolutionProbability?: number;

  closeEmailsSent?: number;

  volume: number;
  volume24Hours: number;
  volume7Days: number;

  // collectedFees: Fees

  groupSlugs?: string[];
  // groupLinks?: GroupLink[]
  uniqueBettorIds?: string[];
  uniqueBettorCount?: number;
  popularityScore?: number;
  followerCount?: number;
  featuredOnHomeRank?: number;
  likedByUserIds?: string[];
  likedByUserCount?: number;

  // PJB:
  outcomeType?: string;
  mechanism?: string;
};

export type Bet = {
  id: string;
  userId: string;

  // denormalized for bet lists
  userAvatarUrl?: string;
  userUsername: string;
  userName: string;

  contractId: string;
  createdTime: number;

  amount: number; // bet size; negative if SELL bet
  loanAmount?: number;
  outcome: string;
  shares: number; // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  probBefore: number;
  probAfter: number;

  // fees: Fees

  isAnte?: boolean;
  isLiquidityProvision?: boolean;
  isRedemption?: boolean;
  challengeSlug?: string;

  // Props for bets in DPM contract below.
  // A bet is either a BUY or a SELL that sells all of a previous buy.
  isSold?: boolean; // true if this BUY bet has been sold
  // This field marks a SELL bet.
  sale?: {
    amount: number; // amount user makes from sale
    betId: string; // id of BUY bet being sold
  };
};

export type User = {
  id: string;
  createdTime: number;

  name: string;
  username: string;
  avatarUrl?: string;

  // For their user page
  bio?: string;
  bannerUrl?: string;
  website?: string;
  twitterHandle?: string;
  discordHandle?: string;

  balance: number;
  totalDeposits: number;

  profitCached: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };

  creatorVolumeCached: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };

  nextLoanCached: number;
  followerCountCached: number;

  followedCategories?: string[];
  homeSections?: string[];

  referredByUserId?: string;
  referredByContractId?: string;
  referredByGroupId?: string;
  lastPingTime?: number;
  shouldShowWelcome?: boolean;
  lastBetTime?: number;
  currentBettingStreak?: number;
  hasSeenContractFollowModal?: boolean;
  freeMarketsCreated?: number;
  isBannedFromPosting?: boolean;
};

const timers: { [k: string]: number } = {};
const ts = function (name: string) {
  timers[name] = Date.now();
};
const te = function (name: string) {
  return ((Date.now() - timers[name]) * 0.001).toFixed(1) + 's';
};

function registerChangeListener(doc: DocumentReference, listener: (snapshot?: DocumentSnapshot) => void) {
  let firstCall = true;
  onSnapshot(doc, (snapshot) => {
    if (firstCall) {
      firstCall = false;
    } else {
      listener(snapshot);
    }
  });
}

export default class ManifoldFirestore {
  private readonly contracts: CollectionReference<Contract>;
  private readonly users: CollectionReference<User>;

  private allUsers: { [k: string]: User } = {};

  constructor() {
    const app = initializeApp(MANIFOLD_FIREBASE_CONFIG, 'manifold');
    const db = getFirestore(app);
    this.contracts = <CollectionReference<Contract>>collection(db, 'contracts');
    this.users = <CollectionReference<User>>collection(db, 'users');

    this.test();
  }

  async loadAllUsers() {
    // const users = await getDocs(this.users);
    // users.forEach((u) => console.log(u.data().username));

    await new Promise<void>((r) =>
      onSnapshot(this.users, (changes?) => {
        changes.docs.map((d) => (this.allUsers[d.data().id] = d.data()));
        r();
      })
    );
  }

  getManifoldUserByManifoldID(manifoldID: string) {
    return this.allUsers[manifoldID];
  }

  // async getFullMarketByID(marketID: string): Promise<AbstractMarket> {
  //   const contract = (await getDoc(doc(this.contracts, marketID))).data();
  //   const betsQuery = await getDocs(query(collection(this.contracts, marketID, 'bets'), orderBy('createdTime', 'desc')));
  //   const bets = <Bet[]> betsQuery.docs.map((d) => d.data());

  //   const { id, creatorUsername, creatorName, creatorId, createdTime, closeTime, question, slug, isResolved, resolutionTime, resolution } = contract;

  //   const abstractMarket = {
  //     id,
  //     creatorUsername,
  //     creatorName,
  //     creatorId,
  //     createdTime,
  //     closeTime,
  //     question,
  //     description: undefined,
  //     url: `https://${MANIFOLD_API_BASE_URL}/${creatorUsername}/${slug}`,
  //     probability: contract.outcomeType === 'BINARY' ? this.getProbability(contract) : undefined,
  //     isResolved,
  //     resolutionTime,
  //     resolution,
  //     bets,
  //   };

  //   return abstractMarket;
  // }

  // getProbability(contract: Contract) {
  //   if (contract.mechanism === 'cpmm-1') {
  //     return this.getCpmmProbability(contract.pool, contract.p);
  //   }
  //   throw new Error('DPM probability not supported.');
  // }

  // getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
  //   const { YES, NO } = pool;
  //   return (p * NO) / ((1 - p) * YES + p * NO);
  // }

  async test() {
    log.info('Accessing Manifold Firestore...');

    ts('users');
    await this.loadAllUsers();
    log.info(`Updated ${this.allUsers.length} users in ${te('users')}.`);

    ts('contracts');
    // const docs = await getDocs(query(contracts));
    // log.info("Found " + docs.size + " markets in " + te("contracts"));
    // docs.forEach((d) => {
    //     const data = <Contract> d.data();
    //     log.info(data.slug)
    // })

    ts('contract');
    // console.log(await this.getFullMarketByID('ta1Drot634OoAi2AkXCj'));
    registerChangeListener(doc(this.contracts, 'ta1Drot634OoAi2AkXCj'), (s) => {
      log.info('Contract info updated.');
      // console.log(s.data());
    });

    let firstSnapshot = true;
    onSnapshot(collection(this.contracts, 'ta1Drot634OoAi2AkXCj', 'bets'), (bets) => {
      if (firstSnapshot) {
        firstSnapshot = false;
        return;
      }

      bets.docChanges().forEach((changedDoc) => {
        const data = <Bet>changedDoc.doc.data();
        if (data.isRedemption) {
          return;
        }
        switch (changedDoc.type) {
          case 'added':
            log.info('New bet: ');
            break;
          case 'modified':
            log.info('Bet modified: ');
            break;
          case 'removed':
            log.info('Bet removed: ');
            break;
        }
        log.info(data.amount + ' of ' + data.outcome);
      });
    });
    log.info('Found in ' + te('contract'));
  }
}
