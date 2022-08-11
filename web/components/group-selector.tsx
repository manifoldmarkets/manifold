import { Group } from "common/group";
import { Combobox } from "@headlessui/react";
import { CheckIcon, RefreshIcon, SelectorIcon } from "@heroicons/react/outline";
import clsx from "clsx";
import { useEffect, useState } from "react";

const APIBase = "https://dev.manifold.markets/api/v0/";

async function fetchGroups(): Promise<Group[]> {
    const r = await fetch(`${APIBase}groups`);
    const groups = await r.json();
    return groups;
}

export const useMemberGroups = (
    setMemberGroups: (groups: Group[]) => void,
    options?: { withChatEnabled: boolean },
    sort?: { by: "mostRecentChatActivityTime" | "mostRecentContractAddedTime" }
) => {
    useEffect(() => {
        fetchGroups().then((groups) => {
            setMemberGroups(groups);
        });
    }, [options?.withChatEnabled, sort?.by]);
    // return memberGroups;
};

export function GroupSelector(props: { selectedGroup: Group | undefined; setSelectedGroup: (group: Group) => void, onRefresh?: () => void }) {
    const { selectedGroup, setSelectedGroup, onRefresh } = props;

    const [isRefreshingGroups, setIsRefreshingGroups] = useState<boolean>(false);
    const [memberGroups, setMemberGroups] = useState<Group[] | undefined>();
    const [query, setQuery] = useState("");

    useMemberGroups(setMemberGroups);
    const filteredGroups =
        memberGroups?.filter((group) => {
            return group.name.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) >= 0;
        }) || [];

    const onRefreshClicked = () => {
        setIsRefreshingGroups(true);
        fetchGroups()
            .then((groups) => {
                setMemberGroups(groups);
                for (const g of groups) {
                    if (g.id === selectedGroup?.id) {
                        setSelectedGroup(g);
                        break;
                    }
                    setSelectedGroup(undefined);
                }
                onRefresh?.();
            })
            .finally(() => setIsRefreshingGroups(false));
    };

    return (
        <div className="flex flex-row justify-center">
            <Combobox as="div" value={selectedGroup} onChange={setSelectedGroup} nullable={true} className={"text-sm w-full"}>
                <div className="flex grow" style={{ ...(isRefreshingGroups && { pointerEvents: "none" }) }}>
                    <div className="relative flex w-full justify-items-stretch">
                        <Combobox.Input
                            spellCheck="false"
                            className="w-full border rounded-md border-gray-300 bg-white pl-4 pr-8 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            onChange={(event) => setQuery(event.target.value)}
                            displayValue={(group: Group) => group && group.name}
                            placeholder={"E.g. Science, Politics"}
                            style={{borderTopRightRadius: "0", borderBottomRightRadius: "0"}}
                        />
                        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                            <SelectorIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                        </Combobox.Button>

                        <Combobox.Options className="absolute z-50 mt-[3.2rem] max-h-96 w-full overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {filteredGroups.map((group: Group) => (
                                <Combobox.Option
                                    key={group.id}
                                    value={group}
                                    className={({ active }) => clsx("relative h-12 cursor-pointer select-none py-2 pl-4 pr-9", active ? "bg-indigo-500 text-white" : "text-gray-900")}
                                >
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
                    </div>
                    <button className={clsx("btn btn-primary btn-square p-2 rounded-md", isRefreshingGroups ? "loading" : "")} onClick={onRefreshClicked} style={{borderTopLeftRadius: "0", borderBottomLeftRadius: "0"}}>
                        {!isRefreshingGroups && <RefreshIcon />}
                    </button>
                </div>
            </Combobox>
        </div>
    );
}
