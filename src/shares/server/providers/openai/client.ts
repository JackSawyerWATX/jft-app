import 'server-only';
import OpenAI from 'openai';
import { openAIKey } from './key';

/** Shared server-only policy; each operation chooses its own deadline. */
export async function openAIClient(timeout: number) {
  return new OpenAI({
    apiKey: await openAIKey(),
    timeout,
    maxRetries: 0,
    logLevel: 'off'
  });
}
