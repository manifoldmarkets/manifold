import { PlusCircleIcon } from '@heroicons/react/outline';
import { CheckIcon, PlusCircleIcon as PlusCircleIconSolid, XCircleIcon, XIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import { PacketGroupControlFields } from '@common/packets';
import SocketWrapper from '@common/socket-wrapper';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Col } from './layout/col';
import { Modal } from './layout/modal';
import { Row } from './layout/row';
import { Title } from './title';

function Chip(props: { text: string }) {
  return <div className="rounded-full bg-red-500 text-white px-2 py-0.5 text-sm mr-1 animate-[popInS_0.2s_ease-in-out_forwards]">{props.text}</div>;
}

function ControlURL(props: { removeRequested: () => void; field: Field; onUpdate: () => void }) {
  const { removeRequested, field, onUpdate } = props;

  const onUpdateURL = (e: ChangeEvent<HTMLInputElement>) => {
    field.text = e.target.value;
    if (e.target.value) {
      field.state = State.CHECKING;
    } else {
      field.state = State.NONE;
    }
    onUpdate();
  };
  return (
    <Row className="gap-1 items-center animate-[popInS_0.4s_ease-in-out_forwards]">
      <Row className="w-full items-center">
        {field.channelName && <Chip text={field.channelName} />}
        <input
          placeholder="Dock URL"
          value={field.text}
          className="grow border rounded-md border-gray-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none placeholder:text-gray-200"
          onChange={onUpdateURL}
          disabled={field.disabled}
        />
      </Row>
      <div className={clsx('relative group', !field.disabled && 'cursor-pointer')} onClick={!field.disabled ? removeRequested : undefined}>
        <div className={clsx('absolute opacity-0 w-6 h-6 transition-opacity', !field.disabled && 'group-hover:opacity-100')}>
          <XCircleIcon className="absolute fill-gray-500 animate-[popIn_0.2s_ease-in-out_forwards]" />
        </div>
        <div className={clsx('transition-opacity peer w-6 h-6', !field.disabled && 'group-hover:opacity-0')}>
          {field.state === State.CHECKING ? (
            <div className="absolute w-6 h-6 flex items-center justify-center">
              <div className="border-gray-400 border-2 rounded-full !border-t-transparent border-solid w-4 h-4 animate-spin"></div>
            </div>
          ) : field.state === State.VALID ? (
            <CheckIcon className="fill-primary animate-[popIn_0.2s_ease-in-out_forwards]" />
          ) : field.state === State.INVALID ? (
            <XIcon className="fill-red-500 animate-[popIn_0.2s_ease-in-out_forwards]" />
          ) : (
            <></>
          )}
        </div>
      </div>
    </Row>
  );
}

enum State {
  NONE,
  CHECKING,
  VALID,
  INVALID,
}

type Field = {
  initialValue?: string;
  disabled?: boolean;
  text: string;
  state: State;
  channelName?: string;
};

export function ModalGroupControl(props: { sw: SocketWrapper<Socket>; open: boolean; setOpen: (open: boolean) => void }) {
  const { sw, open, setOpen } = props;

  const REPEAT_EDIT_TIMEOUT_MS = 200;

  const fields = useRef<Field[]>([]);
  const [, rerender] = useState(false);
  const sendUpdateTimeout = useRef(null);
  const timeout = useRef(null);

  function getBlankField() {
    return { text: '', state: State.NONE };
  }

  useEffect(() => {
    fields.current = [];
    fields.current.push({ state: State.VALID, initialValue: location.href, text: location.href, disabled: true });
    fields.current.push(getBlankField());

    sw.on(PacketGroupControlFields, (p) => {
      fields.current = [];
      fields.current.push({ state: State.VALID, initialValue: location.href, text: location.href, disabled: true });
      for (const f of p.fields) {
        fields.current.push({ state: f.valid ? State.VALID : State.INVALID, text: f.url, channelName: f.affectedUserName });
      }
      rerender((t) => !t);
    });
  }, []);

  const addNewLine = () => {
    fields.current.push(getBlankField());
    rerender((t) => !t);
  };

  const removeLine = (index: number) => () => {
    fields.current.splice(index, 1);
    onUpdate();
  };

  const onUpdate = () => {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    if (sendUpdateTimeout.current) {
      clearTimeout(sendUpdateTimeout.current);
      sendUpdateTimeout.current = null;
    }
    const checkFields = () => {
      sw.emit(PacketGroupControlFields, {
        fields: fields.current
          .filter((f) => !f.disabled)
          .map((f) => {
            return { url: f.text, valid: f.state === State.CHECKING };
          }),
      });
      sendUpdateTimeout.current = null;
    };
    sendUpdateTimeout.current = setTimeout(checkFields, REPEAT_EDIT_TIMEOUT_MS);
    rerender((t) => !t);
  };

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'} className="rounded-md bg-white p-4">
      <Title text="Dock control URLs" className="!mt-2" />
      <Col className="gap-2">
        {fields.current.map((f, index) => (
          <ControlURL key={index} removeRequested={removeLine(index)} field={f} onUpdate={onUpdate} />
        ))}
        {fields.current.length < 10 && (
          <div className="flex flex-col items-center">
            <div className="relative w-7 h-7 group cursor-pointer">
              <PlusCircleIcon className="absolute stroke-gray-300 opacity-100 group-hover:opacity-0 transition-all" onClick={addNewLine} />
              <PlusCircleIconSolid className="absolute opacity-0 group-hover:opacity-100 fill-gray-300 transition-all" onClick={addNewLine} />
            </div>
          </div>
        )}
      </Col>
    </Modal>
  );
}
