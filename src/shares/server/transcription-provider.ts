import 'server-only';

// Server composition: change this alongside transcription/provider.ts when switching STT.
// Provider error classification stays here so HTTP handlers never inspect SDK errors.
export { issueTranscriptionCredential } from './providers/openai/session';
export {
  reportTranscriptionFailure,
  reportTranscriptionConfiguration
} from './providers/openai/diagnostics';
