import clsx from 'clsx';
import { Row } from './layout/row';
import { Spinner } from './spinner';

export function LoadingOverlay(props: { visible: boolean; message: string; loading: boolean; className?: string; spinnerBorderColor?: string }) {
  const { visible, message, loading, className, spinnerBorderColor } = props;
  return (
    true && (
      <div className={clsx('bg-canvas-500 text-ink-0 absolute inset-0 z-[9999] flex items-center justify-center bg-opacity-75', !visible && 'pointer-events-none opacity-0', className)}>
        <Row className={clsx('grow items-center justify-center gap-4 p-6', loading ? 'text-left' : 'text-center')}>
          {loading && <Spinner borderColor={clsx(spinnerBorderColor ? spinnerBorderColor : 'border-ink-1000')} />}
          <div>{message}</div>
        </Row>
      </div>
    )
  );
}
