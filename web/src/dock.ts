import "./style/dock.scss";

const APIBase = "https://dev.manifold.markets/api/v0/";

type Group = {
    anyoneCanJoin: boolean,
    name: string,
    slug: string,
    creatorId: string,
    contractIds: string[],
    about: string,
    mostRecentActivityTime: number,
    createdTime: number,
    id: string,
    memberIds: string[],
}

class App {
    constructor() {
        //   
    }

    async fetchGroups(): Promise<Group[]> {
        const r = await fetch(`${APIBase}groups`);
        return <Promise<Group[]>> r.json();
    }

    async launch() {
        const groups = await this.fetchGroups();
        console.log(groups);
    }
}

const app = new App();
app.launch();