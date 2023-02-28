import clsx from 'clsx';

export function Spinner(props: { borderColor?: string } & JSX.IntrinsicElements['div'] = { borderColor: 'border-ink' }) {
  const { className, borderColor, ...rest } = props;
  return <div className={clsx(`min-h-[2.5rem] min-w-[2.5rem] border-4 ${borderColor} animate-spin rounded-full border-solid border-b-transparent`, className)} {...rest} />;
}
