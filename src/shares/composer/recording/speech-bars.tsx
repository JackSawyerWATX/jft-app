// Symmetric decorative silhouette, rather than measured microphone volume.
const BAR_HEIGHTS_PX = [16, 28, 40, 56, 70, 56, 40, 28, 16];
const BAR_ANIMATION_STAGGER_MS = 70;

/** Speech activity accents; the recorder's state controls their color and animation. */
export function SpeechBars() {
  return (
    <div className="speech-bars" aria-hidden="true">
      {BAR_HEIGHTS_PX.map((height, index) => (
        <span
          key={index}
          style={{
            height,
            animationDelay: `${index * BAR_ANIMATION_STAGGER_MS}ms`
          }}
        />
      ))}
    </div>
  );
}
