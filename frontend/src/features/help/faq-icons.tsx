// Geometría regular de Phosphor (Sparkle, LockKey y GlobeSimple) separada en las
// piezas que gesticulan en faq.css. Licencia en frontend/licenses/phosphor.txt.
import { IconBase, type IconProps } from '@phosphor-icons/react';
import { forwardRef } from 'react';

const RELIABILITY = new Map([
  [
    'regular' as const,
    <g key="regular">
      <path
        data-faq-part="star"
        d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144Z"
      />
      <path
        data-faq-part="spark"
        d="M144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40Z"
      />
      <path
        data-faq-part="dot"
        d="M248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z"
      />
    </g>,
  ],
]);

const PRIVACY = new Map([
  [
    'regular' as const,
    <g key="regular" fillRule="evenodd">
      <path data-faq-part="shackle" d="M80,80V56a48,48,0,0,1,96,0V80H160V56a32,32,0,0,0-64,0V80Z" />
      <path d="M48,80H208a16,16,0,0,1,16,16V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V96A16,16,0,0,1,48,80ZM48,96V208H208V96Z" />
      <path
        data-faq-part="keyhole"
        d="M128,112a28,28,0,0,0-8,54.83V184a8,8,0,0,0,16,0V166.83A28,28,0,0,0,128,112Zm0,40a12,12,0,1,1,12-12A12,12,0,0,1,128,152Z"
      />
    </g>,
  ],
]);

const LANGUAGES = new Map([
  [
    'regular' as const,
    <g key="regular" fillRule="evenodd">
      <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24ZM128,40a88,88,0,1,1-88,88A88.1,88.1,0,0,1,128,40Z" />
      <path d="M40.37,120H215.63v16H40.37Z" />
      <g fill="none" stroke="currentColor">
        <path
          data-faq-part="meridian-west"
          d="M128,42.7A39.8,85.3,0,0,0,128,213.3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-faq-part="meridian-east"
          d="M128,42.7A39.8,85.3,0,0,1,128,213.3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>,
  ],
]);

export const ReliabilityIcon = forwardRef<SVGSVGElement, IconProps>(
  function ReliabilityIcon(props, ref) {
    return <IconBase ref={ref} aria-hidden="true" {...props} weights={RELIABILITY} />;
  },
);

export const PrivacyIcon = forwardRef<SVGSVGElement, IconProps>(function PrivacyIcon(props, ref) {
  return <IconBase ref={ref} aria-hidden="true" {...props} weights={PRIVACY} />;
});

export const LanguagesIcon = forwardRef<SVGSVGElement, IconProps>(
  function LanguagesIcon(props, ref) {
    return <IconBase ref={ref} aria-hidden="true" {...props} weights={LANGUAGES} />;
  },
);
