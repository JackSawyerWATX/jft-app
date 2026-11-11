/** Validate provider configuration when the server starts, without loading credentials. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { transcriptionProvider } =
      await import('./shares/server/transcription-config');
    transcriptionProvider();
  }
}
