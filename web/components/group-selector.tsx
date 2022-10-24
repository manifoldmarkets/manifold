import { Combobox, Menu, Transition } from '@headlessui/react';
import { CheckIcon, PlusCircleIcon, RefreshIcon, SelectorIcon } from '@heroicons/react/outline';
import { ChevronDownIcon, QrcodeIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import { Group } from 'common/group';
import { Fragment, useEffect, useState } from 'react';
import { SelectedGroup } from 'web/lib/selected-group';

async function fetchGroups(APIBase: string, userID: string): Promise<Group[]> {
  const r = await fetch(`${APIBase}groups?availableToUserId=${userID}`);
  const groups = (await r.json()) as Group[];
  return groups;
}

function AdditionalControlsDropdown() {
  return (
    <Menu>
      <div>
        <Menu.Button>
          <button className={clsx('btn btn-primary p-0 rounded-md border-l-green-600')} style={{ borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}>
            <ChevronDownIcon className="w-4 h-4 mt-5" />
          </button>
        </Menu.Button>
      </div>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-14 mr-2 max-w-[calc(100%-1rem)] origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="px-1 py-1 ">
            <Menu.Item>
              {({ active }) => (
                <button className={`${active ? 'bg-secondary text-white' : 'text-gray-900'} group flex w-full items-center rounded-md px-2 py-2 text-sm text-left`}>
                  {active ? <QrcodeIcon className="mr-2 h-5 w-5" aria-hidden="true" /> : <QrcodeIcon className="mr-2 h-5 w-5" aria-hidden="true" />}
                  Group control
                </button>
              )}
            </Menu.Item>
          </div>
          <div className="px-1 py-1">
            {/* TODO: Actually use git commit version */}
            <div className="text-gray-300 font-thin text-xs px-2 py-1">{`Dock v0.2.1`}</div>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

export function GroupSelector(props: { refreshSignal?: number; selectedGroup: Group | undefined; userID: string; setSelectedGroup: (group: Group) => void; onRefresh?: () => void; APIBase: string }) {
  const { refreshSignal, selectedGroup, userID, setSelectedGroup, onRefresh, APIBase } = props;

  const [isRefreshingGroups, setIsRefreshingGroups] = useState<boolean>(false);
  const [memberGroups, setMemberGroups] = useState<Group[] | undefined>();
  const [query, setQuery] = useState('');

  const refreshGroupList = async () => {
    setIsRefreshingGroups(true);
    return fetchGroups(APIBase, userID)
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
        return groups;
      })
      .finally(() => setIsRefreshingGroups(false));
  };

  useEffect(() => {
    refreshGroupList();
  }, [refreshSignal]);

  let previouslySelectedGroup: SelectedGroup = undefined;
  if (typeof window !== 'undefined') {
    try {
      previouslySelectedGroup = JSON.parse(localStorage.getItem('SELECTED_GROUP')) as SelectedGroup;
    } catch (e) {
      // Empty
    }
  }
  useEffect(() => {
    refreshGroupList().then((groups) => {
      if (previouslySelectedGroup && groups) {
        for (const g of groups) {
          if (g.id === previouslySelectedGroup.groupID) {
            setSelectedGroup(g);
            break;
          }
        }
      }
    });
  }, []);

  const filteredGroups =
    memberGroups?.filter((group) => {
      return group.name.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) >= 0;
    }) || [];

  return (
    <div className="flex flex-row justify-center">
      <Combobox as="div" value={selectedGroup} onChange={setSelectedGroup} nullable={true} className={'text-sm w-full'} disabled={isRefreshingGroups}>
        <div className="flex grow" style={{ ...(isRefreshingGroups && { pointerEvents: 'none' }) }}>
          <div className="relative flex w-full justify-items-stretch">
            <Combobox.Input
              spellCheck="false"
              className="w-full border rounded-md border-gray-300 bg-white pl-4 h-12 pr-8 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
              onChange={(event) => setQuery(event.target.value)}
              displayValue={(group: Group) => (group ? group.name : previouslySelectedGroup && previouslySelectedGroup.groupName)}
              placeholder={'Group name'}
              style={{ borderTopRightRadius: '0', borderBottomRightRadius: '0' }}
            />
            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
              <SelectorIcon className="h-10 w-5 text-gray-400" aria-hidden="true" />
            </Combobox.Button>

            <Combobox.Options className="absolute z-50 mt-[3.2rem] max-h-96 w-full overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              {filteredGroups.map((group: Group) => (
                <Combobox.Option
                  key={group.id}
                  value={group}
                  className={({ active }) => clsx('relative h-14 cursor-pointer select-none py-2 pl-4 pr-9', active ? 'bg-indigo-500 text-white' : 'text-gray-900')}
                >
                  {({ active, selected }) => (
                    <>
                      {selected && (
                        <span className={clsx('absolute inset-y-0 left-2 flex items-center pr-4', active ? 'text-white' : 'text-indigo-600')}>
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                      <span className={clsx('ml-5 mt-1 block truncate', selected && 'font-semibold')}>
                        {group.name}
                        <p className="text-gray-400 italic font-light text-xs">{group.slug}</p>
                      </span>
                    </>
                  )}
                </Combobox.Option>
              ))}
              <div
                className="btn btn-sm normal-case w-full justify-start rounded-none border-0 bg-white pl-2 h-14 font-normal text-gray-900 hover:bg-indigo-500 hover:text-white"
                onClick={() => window.open(APIBase.startsWith('https://dev') ? 'https://dev.manifold.markets/groups' : 'https://manifold.markets/groups') /* TODO: Make full generic */}
              >
                <PlusCircleIcon className="text-primary mr-2 h-5 w-5" />
                Create a new Group
              </div>
            </Combobox.Options>
          </div>
        </div>
      </Combobox>
      <button className={clsx('btn btn-primary btn-square p-2 rounded-none', isRefreshingGroups ? 'loading' : '')} onClick={refreshGroupList}>
        {!isRefreshingGroups && <RefreshIcon />}
      </button>
      <AdditionalControlsDropdown />
    </div>
  );
}
