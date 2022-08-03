import * as React from "react";
import { Group } from "common/group";
import { Combobox } from "@headlessui/react";
import { CheckIcon, RefreshIcon, SelectorIcon } from "@heroicons/react/outline";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { LiteUser } from "common/manifold-defs";

const APIBase = "https://dev.manifold.markets/api/v0/";

async function fetchGroups(): Promise<Group[]> {
    // return [];
    const r = await fetch(`${APIBase}groups`);
    return r.json();
}

export const useMemberGroups = (userId: string | null | undefined, options?: { withChatEnabled: boolean }, sort?: { by: "mostRecentChatActivityTime" | "mostRecentContractAddedTime" }) => {
    const [memberGroups, setMemberGroups] = useState<Group[] | undefined>();
    useEffect(() => {
        if (userId) {
            fetchGroups().then((groups) => {
                setMemberGroups(groups);
            });
        }
        // return listenForMemberGroups(
        //     userId,
        //     (groups) => {
        //         if (options?.withChatEnabled) return setMemberGroups(filterDefined(groups.filter((group) => group.chatDisabled !== true)));
        //         return setMemberGroups(groups);
        //     },
        //     sort
        // );
    }, [options?.withChatEnabled, sort?.by, userId]);
    return memberGroups;
};

export function GroupSelector(props: {
    selectedGroup: Group | undefined;
    setSelectedGroup: (group: Group) => void;
    creator: LiteUser | null | undefined;
    options: {
        showSelector: boolean;
        showLabel: boolean;
        ignoreGroupIds?: string[];
    };
}) {
    const { selectedGroup, setSelectedGroup, creator, options } = props;
    const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
    const { showSelector, showLabel, ignoreGroupIds } = options;
    const [query, setQuery] = useState("");
    const memberGroups = (useMemberGroups(creator?.id) ?? []).filter((group) => !ignoreGroupIds?.includes(group.id));
    const filteredGroups = memberGroups; //.filter((group) => searchInAny(query, group.name));

    if (!showSelector || !creator) {
        return (
            <>
                <div className={"label justify-start"}>
                    In Group:
                    {selectedGroup ? <span className=" ml-1.5 text-indigo-600">{selectedGroup?.name}</span> : <span className=" ml-1.5 text-sm text-gray-600">(None)</span>}
                </div>
            </>
        );
    }
    return (
        <div className="form-control items-start">
            <Combobox as="div" value={selectedGroup} onChange={setSelectedGroup} nullable={true} className={"text-sm"}>
                {() => (
                    <>
                        {/* {showLabel && <Combobox.Label className="label justify-start gap-2 text-base">Select group</Combobox.Label>} */}
                        <div className="relative input-group w-full" >
                            <Combobox.Input style={{paddingBottom: "1.11em"}} className="w-full border border-gray-300 bg-white p-3 pl-4 pr-20 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 " onChange={(event) => setQuery(event.target.value)} displayValue={(group: Group) => group && group.name} placeholder={"E.g. Science, Politics"} />
                            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                                <SelectorIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            </Combobox.Button>

                            <Combobox.Options static={isCreatingNewGroup} className="absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                {filteredGroups.map((group: Group) => (
                                    <Combobox.Option key={group.id} value={group} className={({ active }) => clsx("relative h-12 cursor-pointer select-none py-2 pl-4 pr-9", active ? "bg-indigo-500 text-white" : "text-gray-900")}>
                                        {({ active, selected }) => (
                                            <>
                                                {selected && (
                                                    <span className={clsx("absolute inset-y-0 left-2 flex items-center pr-4", active ? "text-white" : "text-indigo-600")}>
                                                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                    </span>
                                                )}
                                                <span className={clsx("ml-5 mt-1 block truncate", selected && "font-semibold")}>{group.name}</span>
                                            </>
                                        )}
                                    </Combobox.Option>
                                ))}
                            </Combobox.Options>

                            {/* <button className="btn btn-primary btn-square p-2" onClick={undefined}>
                                <RefreshIcon />
                            </button> */}
                            {/* <div className="input-group w-full"> */}
                            {/* </div> */}
                        </div>
                    </>
                )}
            </Combobox>
        </div>
    );
}
