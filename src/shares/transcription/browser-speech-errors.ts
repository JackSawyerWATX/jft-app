/** Browser error descriptions contain only app-authored text, never vendor event messages. */
export function browserSpeechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow access in your browser settings.';
    case 'audio-capture':
      return 'Microphone audio is unavailable. Check your microphone and browser settings, then try again.';
    default:
      return 'Speech recognition could not continue. Check your connection and try again.';
  }
}
