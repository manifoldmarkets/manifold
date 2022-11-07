import { InformationCircleIcon } from '@heroicons/react/outline';

export function InfoTooltip(props: { text: string }) {
  const { text } = props;
  return (
    <div className="tooltip xs:tooltip-right before:content-[attr(data-tip)] before:max-w-[12em] before:xs:max-w-[24em] before:xs:w-[calc(100vw-10em)]" data-tip={text}>
      <InformationCircleIcon className="h-5 w-5 text-gray-500" />
    </div>
  );
}
