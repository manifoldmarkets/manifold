import clsx from 'clsx';

export function Title(props: { text: string; className?: string }) {
  const { text, className } = props;
  return <h1 className={clsx('text-primary-700 my-4 inline-block text-2xl sm:my-6 sm:text-3xl', className)}>{text}</h1>;
}
