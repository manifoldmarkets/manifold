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
  return <div className="text-ink-0 mr-1 animate-[popInS_0.2s_ease-in-out_forwards] rounded-full bg-red-500 px-2 py-0.5 text-sm">{props.text}</div>;
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
    <Row className="animate-[popInS_0.4s_ease-in-out_forwards] items-center gap-1">
      <Row className="w-full items-center">
        {field.channelName && <Chip text={field.channelName} />}
        <input
          placeholder="Dock URL"
          value={field.text}
          className="border-ink-300 placeholder:text-ink-200 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 disabled:border-ink-200 disabled:bg-ink-50 disabled:text-ink-500 grow rounded-md border px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:shadow-none"
          onChange={onUpdateURL}
          disabled={field.disabled}
        />
      </Row>
      <div className={clsx('group relative', !field.disabled && 'cursor-pointer')} onClick={!field.disabled ? removeRequested : undefined}>
        <div className={clsx('absolute h-6 w-6 opacity-0 transition-opacity', !field.disabled && 'group-hover:opacity-100')}>
          <XCircleIcon className="fill-ink-500 absolute animate-[popIn_0.2s_ease-in-out_forwards]" />
        </div>
        <div className={clsx('peer h-6 w-6 transition-opacity', !field.disabled && 'group-hover:opacity-0')}>
          {field.state === State.CHECKING ? (
            <div className="absolute flex h-6 w-6 items-center justify-center">
              <div className="border-ink-400 h-4 w-4 animate-spin rounded-full border-2 border-solid !border-t-transparent"></div>
            </div>
          ) : field.state === State.VALID ? (
            <CheckIcon className="fill-primary animate-[popIn_0.2s_ease-in-out_forwards]" />
          ) : field.state === State.INVALID ? (
            <XIcon className="animate-[popIn_0.2s_ease-in-out_forwards] fill-red-500" />
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
    <Modal open={open} setOpen={setOpen} size={'lg'} className="bg-canvas-0 rounded-md p-4">
      <Title text="Dock control URLs" className="!mt-2" />
      <Col className="gap-2">
        {fields.current.map((f, index) => (
          <ControlURL key={index} removeRequested={removeLine(index)} field={f} onUpdate={onUpdate} />
        ))}
        {fields.current.length < 10 && (
          <div className="flex flex-col items-center">
            <div className="group relative h-7 w-7 cursor-pointer">
              <PlusCircleIcon className="stroke-ink-300 absolute opacity-100 transition-all group-hover:opacity-0" onClick={addNewLine} />
              <PlusCircleIconSolid className="fill-ink-300 absolute opacity-0 transition-all group-hover:opacity-100" onClick={addNewLine} />
            </div>
          </div>
        )}
      </Col>
    </Modal>
  );
}
