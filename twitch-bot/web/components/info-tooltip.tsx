import { InformationCircleIcon } from '@heroicons/react/outline';

export function InfoTooltip(props: { text: string }) {
  const { text } = props;
  return (
    <div className="tooltip xs:tooltip-right before:xs:max-w-[24em] before:xs:w-[calc(100vw-10em)] before:max-w-[12em] before:content-[attr(data-tip)]" data-tip={text}>
      <InformationCircleIcon className="text-ink-500 h-5 w-5" />
    </div>
  );
}
