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
          <Menu.Button className={clsx('btn btn-primary rounded-md border-l-green-600 p-0')} style={{ borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}>
            <ChevronDownIcon className="mt-5 h-4 w-4" />
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
          <Menu.Items className="divide-ink-100 bg-canvas-0 ring-ink-1000 absolute right-0 z-50 mt-14 mr-2 max-w-[calc(100%-1rem)] origin-top-right divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none">
            <div className="px-1 py-1 ">
              <Menu.Item>
                {({ active }) => (
                  <button className={`${active ? 'bg-secondary text-ink-1000' : 'text-ink-900'} group flex w-full items-center rounded-md px-2 py-2 text-left text-sm`} onClick={groupControl}>
                    {active ? <QrcodeIcon className="mr-2 h-5 w-5" aria-hidden="true" /> : <QrcodeIcon className="mr-2 h-5 w-5" aria-hidden="true" />}
                    Group control
                  </button>
                )}
              </Menu.Item>
            </div>
            <div className="px-1 py-1">
              {/* TODO: Actually use git commit version */}
              <div className="text-ink-300 px-2 py-1 text-xs font-thin">{`Dock v0.2.1`}</div>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
      <ModalGroupControl sw={sw} open={open} setOpen={setOpen} />
    </>
  );
}
