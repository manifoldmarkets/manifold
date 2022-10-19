import { NamedBet } from 'common/types/manifold-abstract-types';
import { AnyContractType, Bet, Contract, User } from 'common/types/manifold-internal-types';
import { initializeApp, onLog } from 'firebase/app';
import { collection, CollectionReference, doc, DocumentReference, DocumentSnapshot, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';

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
    process.stderr.write = (() => {
      const write = process.stderr.write;
      return function (...rest: any[]) {
        if (!(rest[0] as string).includes('@firebase/firestore')) {
          return write.apply(process.stderr, rest);
        }
      };
    })();

    const app = initializeApp(MANIFOLD_FIREBASE_CONFIG, 'manifold');
    const db = getFirestore(app);
    onLog((l) => {
      switch (l.level) {
        case 'debug':
          log.debug(l.message, l.args);
          break;
        case 'error':
          log.error(l.message, l.args);
          break;
        case 'warn':
          log.warn(l.message, l.args);
          break;
        default:
          log.info(l.message, l.args);
      }
    });
    this.contracts = <CollectionReference<Contract>>collection(db, 'contracts');
    this.users = <CollectionReference<User>>collection(db, 'users');
  }

  async validateConnection() {
    const message = 'Accessing Manifold Firestore...';
    try {
      await getDoc(doc(this.contracts, 'dummy'));
    } catch (e) {
      log.info(message + ' failed.');
      throw new Error('Failed to contact Manifold Firestore: ' + e.message);
    }
    log.info(message + ' success.');
  }

  async loadAllUsers() {
    ts('users');
    await new Promise<void>((r) =>
      onSnapshot(this.users, (changes?) => {
        changes.docs.map((d) => (this.allUsers[d.data().id] = d.data()));
        r();
      })
    );
    log.info(`Loaded ${Object.keys(this.allUsers).length} users in ${te('users')}.`);
  }

  getManifoldUserByManifoldID(manifoldID: string) {
    return this.allUsers[manifoldID];
  }

  async getFullMarketByID(marketID: string, onResolve?: () => void, onNewBet?: (b: Bet) => void): Promise<[DocumentReference<Contract<AnyContractType>>, CollectionReference<Bet>]> {
    ts('mkt' + marketID);
    const contractDoc = doc(this.contracts, marketID);
    const contract = (await getDoc(contractDoc)).data();
    const betCollection = <CollectionReference<Bet>>collection(this.contracts, marketID, 'bets');
    const betsQuery = await getDocs(query(betCollection, orderBy('createdTime', 'asc')));
    const bets = <NamedBet[]>betsQuery.docs.map((d) => {
      const bet = d.data();
      return <NamedBet>{ ...bet, username: bet.userName };
    });

    if (contract.mechanism != 'cpmm-1') throw new Error(`Contract with ID '${marketID}' has an invalid mechanism.`);

    // let betUpdateUnsubscribe = undefined;
    // if (onNewBet) {
    //   let initialUpdate = true;
    //   betUpdateUnsubscribe = onSnapshot(betCollection, (update) => {
    //     if (initialUpdate) {
    //       initialUpdate = false;
    //       return;
    //     }
    //     for (const changedBet of update.docChanges()) {
    //       if (changedBet.type === 'added') {
    //         onNewBet(changedBet.doc.data());
    //       }
    //     }
    //   });
    // }

    // if (onResolve) {
    //   const unsubscribe = onSnapshot(doc(this.contracts, marketID), (update) => {
    //     const contract = update.data();
    //     if (contract.isResolved) {
    //       log.info(`Detected resolution for market ${contract.question}.`);
    //       onResolve();
    //       unsubscribe();
    //       if (betUpdateUnsubscribe) {
    //         betUpdateUnsubscribe();
    //       }
    //     }
    //   });
    // }
    log.debug('Loaded contract ' + marketID + ' in ' + te('mkt' + marketID));

    return [contractDoc, betCollection];

    // const binaryContract = <CPMMBinaryContract>contract;
    // const {
    //   id,
    //   creatorUsername,
    //   creatorName,
    //   creatorId,
    //   createdTime,
    //   closeTime,
    //   question,
    //   slug,
    //   isResolved,
    //   resolutionTime,
    //   resolution,
    //   description,
    //   p,
    //   mechanism,
    //   outcomeType,
    //   pool,
    //   resolutionProbability,
    // } = binaryContract;

    // return {
    //   id,
    //   creatorUsername,
    //   creatorName,
    //   creatorId,
    //   createdTime,
    //   closeTime,
    //   question,
    //   description,
    //   url: `https://${MANIFOLD_API_BASE_URL}/${creatorUsername}/${slug}`,
    //   probability: contract.outcomeType === 'BINARY' ? this.getProbability(contract) : undefined,
    //   isResolved,
    //   resolutionTime,
    //   resolution,
    //   bets,
    //   p,
    //   mechanism,
    //   outcomeType,
    //   pool,
    //   resolutionProbability,
    // };
  }

  getProbability(contract: Contract) {
    if (contract.mechanism === 'cpmm-1') {
      return this.getCpmmProbability(contract.pool, contract.p);
    }
    throw new Error('DPM probability not supported.');
  }

  getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
    const { YES, NO } = pool;
    return (p * NO) / ((1 - p) * YES + p * NO);
  }

  async test() {
    ts('contracts');
    // const docs = await getDocs(query(contracts));
    // log.info("Found " + docs.size + " markets in " + te("contracts"));
    // docs.forEach((d) => {
    //     const data = <Contract> d.data();
    //     log.info(data.slug)
    // })

    ts('contract');
    const market = await this.getFullMarketByID('ta1Drot634OoAi2AkXCj');
    // console.log(market);
    log.info('Found in ' + te('contract'));
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
  }
}
