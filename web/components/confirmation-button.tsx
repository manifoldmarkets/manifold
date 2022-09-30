import clsx from 'clsx';
import { ReactNode, useRef, useState } from 'react';
import { Col } from './layout/col';
import { Modal } from './layout/modal';
import { Row } from './layout/row';

export function ConfirmationButton(props: {
  openModalBtn: {
    label: string;
    icon?: JSX.Element;
    className?: string;
  };
  cancelBtn?: {
    label?: string;
    className?: string;
  };
  submitBtn?: {
    label?: string;
    className?: string;
  };
  children: ReactNode;
  onSubmit?: () => void;
  onOpenChanged?: (isOpen: boolean) => void;
  onSubmitWithSuccess?: () => Promise<boolean>;
}) {
  const { openModalBtn, cancelBtn, submitBtn, onSubmit, children, onOpenChanged, onSubmitWithSuccess } = props;

  const [open, setOpen] = useState(false);
  const completeButtonRef = useRef(null);

  function updateOpen(newOpen: boolean) {
    onOpenChanged?.(newOpen);
    setOpen(newOpen);
  }

  return (
    <>
      <Modal open={open} setOpen={updateOpen} size="md">
        <Col className="gap-4 rounded-md bg-white px-4 xs:px-8 py-4 xs:py-6">
          {children}
          <Row className="flex justify-between items-center gap-4">
            <button ref={completeButtonRef} className={clsx('btn normal-case grow max-w-[15rem]', cancelBtn?.className)} onClick={() => updateOpen(false)}>
              {cancelBtn?.label ?? 'Cancel'}
            </button>
            <button
              className={clsx('btn normal-case grow max-w-[15rem]', submitBtn?.className)}
              onClick={onSubmitWithSuccess ? () => onSubmitWithSuccess().then((success) => updateOpen(!success)) : onSubmit}
            >
              {submitBtn?.label ?? 'Submit'}
            </button>
          </Row>
        </Col>
      </Modal>
      <button className={clsx('btn', openModalBtn.className)} onClick={() => updateOpen(true)}>
        {openModalBtn.label}
      </button>
    </>
  );
}

export function ResolveConfirmationButton(props: { onResolve: () => void; isSubmitting: boolean; openModalButtonClass?: string; submitButtonClass?: string }) {
  const { onResolve, isSubmitting, openModalButtonClass, submitButtonClass } = props;
  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx('border-none self-start', openModalButtonClass, isSubmitting && 'btn-disabled loading'),
        label: 'Resolve',
      }}
      cancelBtn={{
        label: 'Back',
      }}
      submitBtn={{
        label: 'Resolve',
        className: clsx('border-none', submitButtonClass),
      }}
      onSubmit={onResolve}
    >
      <p>Are you sure you want to resolve this market?</p>
    </ConfirmationButton>
  );
}
