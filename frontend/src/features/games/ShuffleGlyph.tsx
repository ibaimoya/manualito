import './shuffle-glyph.css';

export function ShuffleGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon="shuffle"
      aria-hidden="true"
    >
      <path
        className="shuffle-track"
        pathLength="1"
        d="M32 72H55.06A64 64 0 0 1 107.14 98.8L148.86 157.2A64 64 0 0 0 200.94 184H232"
      />
      <path
        className="shuffle-track shuffle-track-crossing"
        pathLength="1"
        d="M32 184H55.06A64 64 0 0 0 107.14 157.2L108.34 155.53M147.66 100.47L148.86 98.8A64 64 0 0 1 200.94 72H232"
      />
      <path d="M208 48L232 72L208 96M208 160L232 184L208 208" />
    </svg>
  );
}
