const ICON_SIZE_PX = 68;
const ICON_VIEW_BOX = '0 0 24 24';
const ICON_STROKE_WIDTH = 1.7;

/** Decorative microphone drawn on a 24-unit grid; its button supplies the accessible label. */
export function MicrophoneIcon() {
  return (
    <svg
      aria-hidden="true"
      width={ICON_SIZE_PX}
      height={ICON_SIZE_PX}
      viewBox={ICON_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
    >
      {/* Rounded microphone capsule. */}
      <rect x="9" y="2" width="6" height="13" rx="3" />
      {/* Microphone cradle, upright stem, and base. */}
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
    </svg>
  );
}
