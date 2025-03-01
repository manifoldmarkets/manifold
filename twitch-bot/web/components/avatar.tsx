import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid';
import clsx from 'clsx';
import Router from 'next/router';
import { MouseEvent } from 'react';

export function Avatar(props: { username?: string; avatarUrl?: string; noLink?: boolean; size: 'xs' | 'sm' | 'lg'; className?: string }) {
  const { username, avatarUrl, noLink, size, className } = props;
  const s = size == 'xs' ? 6 : size === 'sm' ? 8 : 10;

  const widths = {
    xs: 'w-6',
    sm: 'w-8',
    lg: 'w-10',
  };
  const w = widths[size];

  const heights = {
    xs: 'h-6',
    sm: 'h-8',
    lg: 'h-10',
  };
  const h = heights[size];

  const onClick =
    noLink && username
      ? undefined
      : (e: MouseEvent) => {
          e.stopPropagation();
          Router.push(`/${username}`);
        };

  // there can be no avatar URL or username in the feed, we show a "submit comment"
  // item with a fake grey user circle guy even if you aren't signed in
  return avatarUrl ? (
    <img
      className={clsx('bg-canvas-0 flex-shrink-0 rounded-full object-cover', `${w} ${h}`, !noLink && 'cursor-pointer', className)}
      style={{ maxWidth: `${s * 0.25}rem` }}
      src={avatarUrl}
      onClick={onClick}
      alt={username}
      referrerPolicy="no-referrer"
    />
  ) : (
    <UserCircleIcon className={clsx(`bg-canvas-0 flex-shrink-0 rounded-full ${w} ${h} text-ink-500`, className)} aria-hidden="true" />
  );
}

export function EmptyAvatar(props: { size?: number; multi?: boolean }) {
  const { size = 8, multi } = props;
  const insize = size - 3;
  const Icon = multi ? UsersIcon : UserIcon;

  return (
    <div className={`flex flex-shrink-0 h-${size} w-${size} bg-ink-200 items-center justify-center rounded-full`}>
      <Icon className={`h-${insize} w-${insize} text-ink-500`} aria-hidden />
    </div>
  );
}
