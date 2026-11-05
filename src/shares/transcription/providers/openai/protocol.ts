import type { TranscriptionEvents } from '../../types';
import { createOpenAIResults } from './results';
import { reportProviderEvent } from './diagnostics';

/** Bounded per-session wire state. Transport owns resource lifetime; this module owns acknowledgements and transcript ordering. */
export function createOpenAIProtocol(events: TranscriptionEvents) {
  const results = createOpenAIResults(events);
  const seenEvents = new Set<string>();
  const committedItems = new Set<string>();
  let requested = 0;
  return {
    commitRequested() {
      requested++;
    },
    pending: () => requested > 0 || results.pending(),
    accept(value: object) {
      const event = value as Record<string, unknown>;
      if (JSON.stringify(event).length > 65_536)
        throw new Error('Oversized event');
      if (!event || typeof event.type !== 'string')
        throw new Error('Invalid event');
      if (typeof event.event_id === 'string') {
        if (seenEvents.has(event.event_id)) return;
        seenEvents.add(event.event_id);
        if (seenEvents.size > 20_000) throw new Error('Too many events');
      }
      reportProviderEvent(event);
      if (event.type === 'error') {
        const code = (event.error as { code?: string } | undefined)?.code;
        if (code === 'input_audio_buffer_commit_empty') {
          requested = Math.max(0, requested - 1);
          return;
        }
        throw new Error('Provider failure');
      }
      if (event.type === 'conversation.item.input_audio_transcription.failed')
        throw new Error('Transcription failure');
      if (event.type === 'input_audio_buffer.committed') {
        if (typeof event.item_id !== 'string') throw new Error('Invalid item');
        // A repeated item acknowledgement must not settle another outstanding commit.
        if (committedItems.has(event.item_id)) return;
        committedItems.add(event.item_id);
        if (committedItems.size > 1_000) throw new Error('Too many items');
        requested = Math.max(0, requested - 1);
      }
      results.accept(event);
    }
  };
}
