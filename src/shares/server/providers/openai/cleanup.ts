import 'server-only';
import { cleanupConfig } from './config';
import { cleanupInstructions } from './cleanup-prompt';
import { ZodError } from 'zod';
import { CleanupResultError } from '../../cleanup-result-error';
import { zodTextFormat } from 'openai/helpers/zod';
import { cleanupTextSchema } from '../../../cleanup/model';
import { openAIClient } from './client';

/** One non-stored, structured text request. Refused, incomplete, blank or oversized output is rejected rather than replacing the original draft. */
export async function cleanShareText(
  text: string,
  signal?: AbortSignal
): Promise<string> {
  const client = await openAIClient(cleanupConfig.requestTimeoutMs);
  try {
    const response = await client.responses.parse(
      {
        model: cleanupConfig.model,
        reasoning: { effort: 'none' },
        store: false,
        max_output_tokens: cleanupConfig.maxOutputTokens,
        instructions: cleanupInstructions,
        input: text,
        text: { format: zodTextFormat(cleanupTextSchema, 'cleaned_share') }
      },
      { signal }
    );
    if (response.status !== 'completed') {
      const reason = response.incomplete_details?.reason;
      throw new CleanupResultError(
        'cleanup_not_completed',
        reason === 'max_output_tokens' || reason === 'content_filter'
          ? reason
          : undefined
      );
    }
    if (
      response.output.some(
        (item) =>
          item.type === 'message' &&
          item.content.some((part) => part.type === 'refusal')
      )
    )
      throw new CleanupResultError('cleanup_refused');
    if (!response.output_parsed)
      throw new CleanupResultError('missing_cleanup_output');
    return cleanupTextSchema.parse(response.output_parsed).text;
  } catch (cause) {
    if (cause instanceof ZodError || cause instanceof SyntaxError)
      throw new CleanupResultError('invalid_cleanup_output');
    throw cause;
  }
}
