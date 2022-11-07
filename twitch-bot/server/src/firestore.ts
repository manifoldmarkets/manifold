import { UserNotRegisteredException } from 'common/exceptions';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { collection, CollectionReference, deleteField, doc, Firestore, getDoc, getDocs, getFirestore, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { MANIFOLD_DB_LOCATION, TWITCH_BOT_FIREBASE_KEY } from './envs';
import log from './logger';
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
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly dbCollection: CollectionReference;
  readonly userCollection: CollectionReference;

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
    this.dbCollection = collection(this.db, 'manifold-db');
    this.userCollection = collection(this.dbCollection, MANIFOLD_DB_LOCATION, 'users');
  }

  onDevBotActiveUpdated(callback: (d: { devBotLastActive: number }) => void) {
    onSnapshot(this.dbCollection, (doc) => {
      doc.docs.forEach((d) => {
        const data = <{ devBotLastActive: number }>d.data();
        callback(data);
      });
    });
  }

  async updateSelectedMarketForUser(twitchName: string, selectedMarket: string) {
    const docs = await getDocs(query(this.userCollection, where('twitchLogin', '==', twitchName)));
    const data = { selectedMarket: selectedMarket ? selectedMarket : deleteField() };
    updateDoc(doc(this.db, this.userCollection.path, (<UserData>docs.docs[0].data()).manifoldID), data);
  }

  async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
    twitchUsername = twitchUsername.toLocaleLowerCase();
    const docs = await getDocs(query(this.userCollection, where('twitchLogin', '==', twitchUsername)));
    if (docs.size < 1) throw new UserNotRegisteredException(`No user record for Twitch username ${twitchUsername}`);
    if (docs.size > 1) log.warn('More than one user found with Twitch username ' + twitchUsername);
    const data = <UserData>docs.docs[0].data();
    return new User(data);
  }

  async getUserForManifoldID(manifoldID: string): Promise<User> {
    const d = await getDoc(doc(this.db, this.userCollection.path, manifoldID));
    if (!d.exists()) throw new UserNotRegisteredException(`No user record for Manifold ID ${manifoldID}`);
    const data = <UserData>d.data();
    return new User(data);
  }

  async getUserForManifoldAPIKey(apiKey: string): Promise<User> {
    const d = await getDocs(query(this.userCollection, where('APIKey', '==', apiKey)));
    if (d.empty) throw new UserNotRegisteredException(`No user record for API key ${apiKey}`);
    const data = <UserData>d.docs[0].data();
    return new User(data);
  }

  async getUserForControlToken(controlToken: string): Promise<User> {
    if (!controlToken) return null;
    const docs = await getDocs(query(this.userCollection, where('controlToken', '==', controlToken)));
    if (docs.size < 1) return null;
    const data = <UserData>docs.docs[0].data();
    return new User(data);
  }

  async addNewUser(user: User) {
    await setDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), user.data);
  }

  async updateUser(user: User, props: Partial<UserData>) {
    await updateDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), props);
  }

  async getRegisteredTwitchChannels(): Promise<string[]> {
    const docs = await getDocs(query(this.userCollection, where('botEnabled', '==', true)));
    const channelNames = [];
    docs.forEach((doc) => {
      channelNames.push(doc.data().twitchLogin);
    });
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
