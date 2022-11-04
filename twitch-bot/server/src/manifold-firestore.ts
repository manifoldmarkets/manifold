import { AnyContractType, Bet, Contract, User } from 'common/types/manifold-internal-types';
import { initializeApp, onLog } from 'firebase/app';
import { collection, CollectionReference, doc, DocumentReference, getDoc, getFirestore, onSnapshot } from 'firebase/firestore';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';

const timers: { [k: string]: number } = {};
const ts = function (name: string) {
  timers[name] = Date.now();
};
const te = function (name: string) {
  return ((Date.now() - timers[name]) * 0.001).toFixed(1) + 's';
};

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
    let firstLoad = true;
    await new Promise<void>((r) =>
      onSnapshot(this.users, (snapshot?) => {
        snapshot.docChanges().map((change) => {
          const d = change.doc.data();
          // Extra logging:
          // if (!firstLoad) {
          //   const oldUserData = this.allUsers[d.id];
          //   for (const k in d) {
          //     const old = oldUserData && String(oldUserData[k]);
          //     const ne = d && String(d[k]);
          //     if (old != ne) {
          //       log.info(`Field '${k}' changed from '${old}' to '${ne}' for user '${d.username}'`);
          //     }
          //   }
          // }
          this.allUsers[d.id] = d;
        });
        if (firstLoad) {
          r();
          firstLoad = false;
        }
      })
    );
    log.info(`Loaded ${Object.keys(this.allUsers).length} users in ${te('users')}.`);
  }

  getManifoldUserByManifoldID(manifoldID: string) {
    return this.allUsers[manifoldID];
  }

  async getFullMarketByID(marketID: string): Promise<[DocumentReference<Contract<AnyContractType>>, CollectionReference<Bet>]> {
    const contractDoc = doc(this.contracts, marketID);
    const betCollection = <CollectionReference<Bet>>collection(this.contracts, marketID, 'bets');
    return [contractDoc, betCollection];
  }
}
