import type { RealtimeResult } from '@soniox/client';
import type { TranscriptionEvents } from '../../types';

/** The SDK filters control tokens. Finals are incremental; provisional text is
 * a replacement suffix. Preserve fragment spacing instead of inventing word
 * boundaries. Timed duplicate finals are ignored without losing repeated words.
 */
export function createSonioxProtocol(events: TranscriptionEvents) {
  const seen = new Set<string>();
  return {
    accept(result: RealtimeResult) {
      let finalized = '';
      let provisional = '';
      for (const token of result.tokens) {
        if (!token.is_final) {
          provisional += token.text;
          continue;
        }
        if (token.start_ms !== undefined && token.end_ms !== undefined) {
          const id = JSON.stringify([token.start_ms, token.end_ms, token.text]);
          if (seen.has(id)) continue;
          seen.add(id);
        }
        finalized += token.text;
      }
      if (finalized) events.final(finalized, 'verbatim');
      events.interim(result.finished ? '' : provisional);
    },
    finish() {
      events.interim('');
    }
  };
}
