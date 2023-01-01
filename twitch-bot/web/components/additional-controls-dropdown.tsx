import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon, QrcodeIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import SocketWrapper from '@common/socket-wrapper';
import { Fragment, useState } from 'react';
import { Socket } from 'socket.io-client';
import { ModalGroupControl } from './modal-group-control';

export function AdditionalControlsDropdown(props: { sw: SocketWrapper<Socket> }) {
  const { sw } = props;
  const [open, setOpen] = useState(false);
  const groupControl = () => {
    setOpen(true);
  };
  return (
    <>
      <Menu>
        <div>
          <Menu.Button className={clsx('btn btn-primary p-0 rounded-md border-l-green-600')} style={{ borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}>
            <ChevronDownIcon className="w-4 h-4 mt-5" />
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
                  <button className={`${active ? 'bg-secondary text-white' : 'text-gray-900'} group flex w-full items-center rounded-md px-2 py-2 text-sm text-left`} onClick={groupControl}>
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
      <ModalGroupControl sw={sw} open={open} setOpen={setOpen} />
    </>
  );
}
