import { UserNotRegisteredException } from '@common/exceptions';
import { MetricDay } from '@common/types/metric-types';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { collection, CollectionReference, deleteField, doc, Firestore, getDoc, getDocs, getFirestore, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { MANIFOLD_DB_LOCATION, TWITCH_BOT_FIREBASE_KEY } from './envs';
import User, { UserData } from './user';

/* cSpell:disable */
const firebaseConfig = {
  apiKey: TWITCH_BOT_FIREBASE_KEY,
  authDomain: 'manifoldtwitchbot.firebaseapp.com',
  projectId: 'manifoldtwitchbot',
  storageBucket: 'manifoldtwitchbot.appspot.com',
  messagingSenderId: '318358608434',
  appId: '1:318358608434:web:e04094b8b04ce9d20afa2b',
};
/* cSpell:enable */

export default class AppFirestore {
  private readonly app: FirebaseApp;
  private readonly db: Firestore;
  private readonly dbCollection: CollectionReference;
  private readonly userCollection: CollectionReference<UserData>;
  private readonly metricsCollection: CollectionReference<MetricDay>;
  private readonly localUserCache: { [manifoldID: string]: User } = {};

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
    this.dbCollection = collection(this.db, 'manifold-db');
    this.userCollection = <CollectionReference<UserData>>collection(this.dbCollection, MANIFOLD_DB_LOCATION, 'users');
    this.metricsCollection = <CollectionReference<MetricDay>>collection(this.dbCollection, MANIFOLD_DB_LOCATION, 'metrics');
  }

  public async updateMetricsData(epochDay: number, data: MetricDay) {
    return setDoc(doc(this.metricsCollection, epochDay.toFixed(0)), data);
  }

  public async getMetricData(epochDay: number): Promise<MetricDay> {
    return (await getDoc(doc(this.metricsCollection, epochDay.toFixed(0)))).data();
  }

  public async loadUsers() {
    return new Promise<void>((r) =>
      onSnapshot(this.userCollection, (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === 'removed') {
            delete this.localUserCache[change.doc.id];
          } else {
            this.localUserCache[change.doc.id] = new User(change.doc.data());
          }
        }
        r();
      })
    );
  }

  async updateSelectedMarketForUser(twitchName: string, selectedMarket: string) {
    const user = this.getUserForTwitchUsername(twitchName);
    if (!user) throw new UserNotRegisteredException(`No user record for Twitch username ${twitchName}`);
    const data = { selectedMarket: selectedMarket || deleteField() };
    return updateDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), data);
  }

  // TODO: This is denormalizing the definition of user data. Find a way to not do this.
  async updateUserMetricsInfo(user: User, metrics: any) {
    return updateDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), { metrics });
  }

  getUserForTwitchUsername(twitchUsername: string): User {
    twitchUsername = twitchUsername.toLocaleLowerCase();
    for (const manifoldID in this.localUserCache) {
      const user = this.localUserCache[manifoldID];
      if (user.data.twitchLogin === twitchUsername) return user;
    }
    throw new UserNotRegisteredException(`No user record for Twitch username ${twitchUsername}`); //!!! Handle multiple users with the same username
  }

  getUserForManifoldID(manifoldID: string): User {
    const user = this.localUserCache[manifoldID];
    if (!user) throw new UserNotRegisteredException(`No user record for Manifold ID ${manifoldID}`);
    return user;
  }

  getUserForManifoldAPIKey(apiKey: string): User {
    for (const manifoldID in this.localUserCache) {
      const user = this.localUserCache[manifoldID];
      if (user.data.APIKey === apiKey) return user;
    }
    throw new UserNotRegisteredException(`No user record for API key ${apiKey}`);
  }

  getUserForControlToken(controlToken: string): User {
    for (const manifoldID in this.localUserCache) {
      const user = this.localUserCache[manifoldID];
      if (user.data.controlToken === controlToken) return user;
    }
    return null; //!!! Inconsistent response
    // throw new UserNotRegisteredException(`No user record for API key ${apiKey}`);
  }

  async addNewUser(user: User) {
    await setDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), user.data);
  }

  async updateUser(user: User, props: Partial<UserData>) {
    await updateDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), props);
  }

  getRegisteredTwitchChannels(): string[] {
    const channelNames = [];
    for (const manifoldID in this.localUserCache) {
      const user = this.localUserCache[manifoldID];
      if (user.data.botEnabled) {
        channelNames.push(user.data.twitchLogin);
      }
    }
    return channelNames;
  }

  async registerTwitchChannel(channelTwitchLogin: string) {
    const d = await getDocs(query(this.userCollection, where('twitchLogin', '==', channelTwitchLogin)));
    if (d.empty) {
      throw new Error('No user found with Twitch channel ' + channelTwitchLogin);
    }
    await updateDoc(doc(this.userCollection, d.docs[0].id), <Partial<UserData>>{ botEnabled: true });
  }

  async unregisterTwitchChannel(channelTwitchLogin: string) {
    const d = await getDocs(query(this.userCollection, where('twitchLogin', '==', channelTwitchLogin)));
    if (d.empty) {
      throw new Error('No user found with Twitch channel ' + channelTwitchLogin);
    }
    await updateDoc(doc(this.userCollection, d.docs[0].id), <Partial<UserData>>{ botEnabled: <unknown>deleteField() });
  }
}
