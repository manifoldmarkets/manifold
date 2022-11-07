import clsx from 'clsx';

export function Spinner(props: { borderColor?: string } & JSX.IntrinsicElements['div'] = { borderColor: 'border-white' }) {
  const { className, borderColor, ...rest } = props;
  return <div className={clsx(`min-w-[2.5rem] min-h-[2.5rem] border-4 ${borderColor} border-solid rounded-full animate-spin border-b-transparent`, className)} {...rest} />;
}
