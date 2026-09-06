// SVG adaptados de Lucide. Licencia en frontend/licenses/lucide.txt.
import { Icon, type LucideProps } from 'lucide-react';

export function ReliabilityIcon(props: LucideProps) {
  return (
    <Icon {...props} iconNode={[]} aria-hidden="true">
      <path
        data-faq-part="star"
        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
      />
      <path data-faq-part="spark" d="M20 2v4m2-2h-4" />
      <circle data-faq-part="dot" cx="4" cy="20" r="2" />
    </Icon>
  );
}

export function PrivacyIcon(props: LucideProps) {
  return (
    <Icon {...props} iconNode={[]} aria-hidden="true">
      <path data-faq-part="shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path data-faq-part="keyhole" d="M12 15v3" />
    </Icon>
  );
}

export function LanguagesIcon(props: LucideProps) {
  return (
    <Icon {...props} iconNode={[]} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path data-faq-part="meridian" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Icon>
  );
}
