import { ShareApp } from '../shares/share-app';
import { connection } from 'next/server';
import { transcriptionProvider } from '../shares/server/transcription-config';
import { TranscriptionBootstrap } from '../shares/transcription/provider-context';

/** The browser must choose Soniox WebSocket or OpenAI WebRTC for direct audio.
 * Serialize only the non-secret provider name; credentials are issued after Record.
 * A backend-only adapter would require proxying microphone audio through Amplify.
 */
export default async function Home() {
  await connection();
  return (
    <TranscriptionBootstrap provider={transcriptionProvider()}>
      <ShareApp />
    </TranscriptionBootstrap>
  );
}
