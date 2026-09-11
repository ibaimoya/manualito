import { IconBase, type IconProps, type IconWeight } from '@phosphor-icons/react';
import { forwardRef, type ReactElement } from 'react';
import './navigation-icons.css';

const compassRing = (
  <circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" strokeWidth="16" />
);
const compassNeedle = (
  <path
    className="compass-needle"
    d="M172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"
  />
);
const compassWeights = new Map<IconWeight, ReactElement>([
  [
    'regular',
    <>
      {compassRing}
      {compassNeedle}
    </>,
  ],
  [
    'duotone',
    <>
      <path
        className="compass-needle"
        d="M128,32a96,96,0,1,0,96,96A96,96,0,0,0,128,32Zm16,112L80,176l32-64,64-32Z"
        opacity="0.2"
      />
      {compassRing}
      {compassNeedle}
    </>,
  ],
]);

export const ExploreIcon = forwardRef<SVGSVGElement, IconProps>(function ExploreIcon(props, ref) {
  return <IconBase ref={ref} {...props} weights={compassWeights} />;
});

export function SidebarToggleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <rect className="sidebar-panel" x="32" y="48" width="56" height="160" opacity="0.2" />
      <rect
        x="32"
        y="48"
        width="192"
        height="160"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
      />
      <path
        className="sidebar-divider"
        d="M88 56V200"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
      />
    </svg>
  );
}
