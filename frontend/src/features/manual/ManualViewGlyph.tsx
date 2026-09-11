import type { ManualView } from './ManualViewSwitch';
import './manual-view-glyph.css';

export function ManualViewGlyph({
  view,
  selected,
}: Readonly<{ view: ManualView; selected: boolean }>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      className="hidden @2xl/app:block"
    >
      {view === 'text' && (
        <>
          {selected && <path d="M208,88H152V32Z" opacity="0.2" />}
          <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />
          <g fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round">
            <path className="view-text-line" d="M96 136H160" />
            <path className="view-text-line view-text-line-last" d="M96 168H160" />
          </g>
        </>
      )}
      {view === 'original' && (
        <>
          {selected && (
            <path
              d="M224,56V178.06l-39.72-39.72a8,8,0,0,0-11.31,0L147.31,164,97.66,114.34a8,8,0,0,0-11.32,0L32,168.69V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z"
              opacity="0.2"
            />
          )}
          <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200Z" />
          <circle className="view-image-sun" cx="156" cy="100" r="12" />
        </>
      )}
      {view === 'compare' && (
        <>
          {selected && <rect x="48" y="48" width="160" height="160" rx="8" opacity="0.2" />}
          <rect
            x="48"
            y="48"
            width="160"
            height="160"
            rx="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
          />
          <path
            className="view-compare-divider"
            d="M128 56V200"
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
          />
        </>
      )}
    </svg>
  );
}
