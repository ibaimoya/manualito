// Trazados de Phosphor 2.1.10 (MIT), separados para animar sus piezas.
import { IconBase, type IconProps, type IconWeight } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { cn } from '@/shared/lib/cn';

export type ActionIconProps = Omit<IconProps, 'weight' | 'mirrored' | 'strokeWidth'> & {
  weight?: 'regular' | 'duotone';
};

function weights(draw: (duotone: boolean) => ReactElement) {
  return new Map<IconWeight, ReactElement>([
    ['regular', draw(false)],
    ['duotone', draw(true)],
  ]);
}

function ActionIcon({
  className,
  weight = 'regular',
  weights,
  ...props
}: ActionIconProps & { weights: Map<IconWeight, ReactElement> }) {
  return (
    <IconBase
      aria-hidden="true"
      {...props}
      weight={weight}
      weights={weights}
      className={cn('action-icon', className)}
    />
  );
}

// Trash. La tapa con asa se separa del cuerpo en U por su base (y 64).
const TRASH = weights((duotone) => (
  <>
    {duotone && <path d="M200,64V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V64Z" opacity="0.2" />}
    <path d="M48,64V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64H192V208H64V64ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
    <path
      data-icon-part="trash-lid"
      d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Z"
    />
  </>
));

export function TrashIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={TRASH} />;
}

// Lock. El arco se separa del cuerpo por la línea superior del cuerpo (y 80).
const LOCK = weights((duotone) => (
  <>
    {duotone && (
      <path
        d="M216,96V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H208A8,8,0,0,1,216,96Z"
        opacity="0.2"
      />
    )}
    <path d="M208,80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM208,208H48V96H208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z" />
    <path
      data-icon-part="lock-shackle"
      d="M176,80V56a48,48,0,0,0-96,0V80H96V56a32,32,0,0,1,64,0V80Z"
    />
  </>
));

export function AccountIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={LOCK} />;
}

// Los dos aros reconstruyen el anillo de Phosphor en reposo.
const CAMERA = weights((duotone) => (
  <>
    {duotone && (
      <path
        d="M208,64H176L160,40H96L80,64H48A16,16,0,0,0,32,80V192a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V80A16,16,0,0,0,208,64ZM128,168a36,36,0,1,1,36-36A36,36,0,0,1,128,168Z"
        opacity="0.2"
      />
    )}
    <path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8Z" />
    <g data-icon-part="camera-lens" fill="none" stroke="currentColor" strokeWidth="8">
      <circle cx="128" cy="132" r="40" />
      <circle className="camera-iris" cx="128" cy="132" r="32" />
    </g>
  </>
));

export function CameraIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={CAMERA} />;
}

const SIGN_OUT = weights((duotone) => (
  <>
    {duotone && (
      <path d="M224,56V200a16,16,0,0,1-16,16H48V40H208A16,16,0,0,1,224,56Z" opacity="0.2" />
    )}
    <path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Z" />
    <path
      data-icon-part="exit-arrow"
      d="M229.66,122.34l-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"
    />
  </>
));

export function LogOutIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={SIGN_OUT} />;
}

// Las páginas de BookOpen se abren desde el lomo fijo (x 120 y x 136).
const BOOK_OPEN = weights((duotone) => (
  <>
    <g data-icon-part="book-page-left">
      {duotone && <path d="M24,56H96a32,32,0,0,1,32,32V232a32,32,0,0,0-32-32H24Z" opacity="0.2" />}
      <path d="M120,56A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192H32V64H96a24,24,0,0,1,24,24Z" />
    </g>
    <g data-icon-part="book-page-right">
      {duotone && (
        <path d="M232,56V200H160a32,32,0,0,0-32,32V88a32,32,0,0,1,32-32Z" opacity="0.2" />
      )}
      <path d="M136,56a40,40,0,0,1,24-8h72a8,8,0,0,1,8,8V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,24V200a39.81,39.81,0,0,1,24-8h64V64H160a24,24,0,0,0-24,24Z" />
    </g>
    <path d="M120,56a40,40,0,0,1,8,8,40,40,0,0,1,8-8V232a8,8,0,0,1-16,0Z" />
  </>
));

export function AddManualIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={BOOK_OPEN} />;
}

// Composición propia: esquinas de Scan tal cual y tres líneas trazadas
// (grosor 16, remate redondo) para conservar el barrido por dasharray.
const EXTRACTED_TEXT = weights((duotone) => (
  <>
    {duotone && (
      <path
        d="M80,72h96a8,8,0,0,1,8,8v96a8,8,0,0,1-8,8H80a8,8,0,0,1-8-8V80A8,8,0,0,1,80,72Z"
        opacity="0.2"
      />
    )}
    <path d="M224,40V80a8,8,0,0,1-16,0V48H176a8,8,0,0,1,0-16h40A8,8,0,0,1,224,40ZM80,208H48V176a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H80a8,8,0,0,0,0-16Zm136-40a8,8,0,0,0-8,8v32H176a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V176A8,8,0,0,0,216,168ZM40,88a8,8,0,0,0,8-8V48H80a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8V80A8,8,0,0,0,40,88Z" />
    {/* El offset oculta también los remates en reposo. */}
    <g
      className="scan-text-halo"
      fill="none"
      stroke="currentColor"
      strokeWidth="32"
      strokeLinecap="round"
      opacity="0.25"
      strokeDasharray="1 2"
      strokeDashoffset="1.5"
    >
      <path d="M80,88h80" pathLength="1" />
      <path d="M80,128h96" pathLength="1" />
      <path d="M80,168h56" pathLength="1" />
    </g>
    <g
      className="scan-text-lines"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
    >
      <path d="M80,88h80" pathLength="1" />
      <path d="M80,128h96" pathLength="1" />
      <path d="M80,168h56" pathLength="1" />
    </g>
  </>
));

export function ExtractedTextIcon(props: ActionIconProps) {
  return <ActionIcon {...props} weights={EXTRACTED_TEXT} />;
}
