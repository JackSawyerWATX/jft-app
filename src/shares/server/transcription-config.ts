import 'server-only';
import {
  parseTranscriptionProvider,
  type TranscriptionProvider
} from '../transcription/config';

let selected: TranscriptionProvider | undefined;

/** Fixed on first server initialization; changing deployment configuration requires a restart. */
export function transcriptionProvider(): TranscriptionProvider {
  if (!selected) {
    const provider = parseTranscriptionProvider(process.env.STT_PROVIDER);
    selected = provider;
  }
  return selected;
}
