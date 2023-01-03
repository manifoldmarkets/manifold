import clsx from 'clsx';
import { Row } from './layout/row';
import { Spinner } from './spinner';

export function LoadingOverlay(props: { visible: boolean; message: string; loading: boolean; className?: string; spinnerBorderColor?: string }) {
  const { visible, message, loading, className, spinnerBorderColor } = props;
  return (
    true && (
      <div className={clsx('absolute inset-0 z-[9999] flex items-center justify-center bg-gray-500 bg-opacity-75 text-white', !visible && 'pointer-events-none opacity-0', className)}>
        <Row className={clsx('grow items-center justify-center gap-4 p-6', loading ? 'text-left' : 'text-center')}>
          {loading && <Spinner borderColor={clsx(spinnerBorderColor ? spinnerBorderColor : 'border-white')} />}
          <div>{message}</div>
        </Row>
      </div>
    )
  );
}
