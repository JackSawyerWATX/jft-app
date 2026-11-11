import 'server-only';
import { secretKey } from '../../secret-key';

/** Preserve the existing OpenAI direct-key precedence and independent binding. */
export async function openAIKey(): Promise<string> {
  return (
    process.env.STT_OPENAI_API_KEY ||
    secretKey(process.env.STT_OPENAI_SECRET_ARN)
  );
}
