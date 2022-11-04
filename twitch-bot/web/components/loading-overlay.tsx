import clsx from 'clsx';
import { Row } from './layout/row';
import { Spinner } from './spinner';

export function LoadingOverlay(props: { visible: boolean; message: string; loading: boolean; className?: string; spinnerBorderColor?: string }) {
  const { visible, message, loading, className, spinnerBorderColor } = props;
  return (
    true && (
      <div
        className={clsx(
          'absolute inset-0 flex justify-center items-center bg-gray-500 bg-opacity-75 z-[9999] text-white transition-opacity duration-500',
          !visible && 'opacity-0 pointer-events-none',
          className
        )}
      >
        <Row className={clsx('justify-center grow items-center gap-4 p-6', loading ? 'text-left' : 'text-center')}>
          {loading && <Spinner borderColor={clsx(spinnerBorderColor ? spinnerBorderColor : 'border-white')} />}
          <div>{message}</div>
        </Row>
      </div>
    )
  );
}
