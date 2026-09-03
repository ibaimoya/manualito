// SVG adaptados de Lucide. Licencias en frontend/licenses/lucide.txt.
import { Icon, type LucideProps } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

function ActionIcon({ className, ...props }: LucideProps) {
  return (
    <Icon iconNode={[]} aria-hidden="true" {...props} className={cn('action-icon', className)} />
  );
}

export function TrashIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path d="M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <g data-icon-part="trash-lid">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </g>
    </ActionIcon>
  );
}

export function AccountIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path data-icon-part="lock-shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
      <rect width="18" height="11" x="3" y="11" rx="2" />
    </ActionIcon>
  );
}

export function CameraIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <circle data-icon-part="camera-lens" cx="12" cy="13" r="3" />
    </ActionIcon>
  );
}

export function LogOutIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <g data-icon-part="exit-arrow">
        <path d="m16 17 5-5-5-5M21 12H9" />
      </g>
    </ActionIcon>
  );
}

export function AddManualIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path d="M12 5v16" />
      <path
        data-icon-part="book-pages"
        d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"
      />
    </ActionIcon>
  );
}

export function ExtractedTextIcon(props: LucideProps) {
  return (
    <ActionIcon {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <g className="scan-text-lines">
        <path d="M7 8h8" pathLength="1" />
        <path d="M7 12h10" pathLength="1" />
        <path d="M7 16h6" pathLength="1" />
      </g>
    </ActionIcon>
  );
}
