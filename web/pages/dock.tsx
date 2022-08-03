import * as React from "react";
// import "../style/globals.scss";
import "../styles/Dock.module.scss";

import CreateMarketButton from "../components/create-market";
import { GroupSelector } from "../components/group-selector";
import { LiteUser } from "common/manifold-defs";
import { Group } from "common/group";
import { RefreshIcon } from "@heroicons/react/outline";

const dummyUser: LiteUser = { id: "asdasdfgdsef" } as any;

export default () => {
    const [selectedGroup, setSelectedGroup] = React.useState<Group | undefined>(undefined);

    return (
        <div>
            {/* <CreateMarketButton></CreateMarketButton> */}
            {/* <div className="input-group centered"> */}
                <button className="w-full btn btn-secondary" onClick={undefined}>
                    Create and feature a question
                </button>
            {/* </div> */}
            <div className={"mt-2"}>
                <div>
                    <label className="label"></label>
                    <div className="input-group w-full">
                        <GroupSelector selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} creator={dummyUser} options={{ showSelector: true, showLabel: true }}></GroupSelector>
                        <button className="btn btn-primary btn-square p-2" onClick={undefined}>
                            <RefreshIcon />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
