import type { TranscriptionEvents } from '../../types';

const TEXT_LIMIT = 10_000;
const bounded = (text: string) =>
  Array.from(text).slice(0, TEXT_LIMIT).join('');

type Item = {
  previous?: string | null;
  committed: boolean;
  partial: string;
  final?: string;
};

/** Orders committed audio turns, replaces partial text with corrected finals, and emits each final once. */
export function createOpenAIResults(events: TranscriptionEvents) {
  const items = new Map<string, Item>();
  const seen = new Set<string>();
  let last: string | null = null;
  let committedTail: string | null = null;
  const interim = () =>
    events.interim(
      bounded(
        [...items.values()]
          .map((item) => item.final ?? item.partial)
          .filter(Boolean)
          .join(' ')
      )
    );
  return {
    pending: () => items.size > 0,
    /** Unknown protocol events are ignored; malformed known events fail closed in the engine. */
    accept(event: Record<string, unknown>) {
      if (typeof event.item_id !== 'string') return;
      const id = event.item_id;
      if (seen.has(id)) return;
      const item = items.get(id) ?? { committed: false, partial: '' };
      if (event.type === 'input_audio_buffer.committed') {
        if (
          event.previous_item_id != null &&
          typeof event.previous_item_id !== 'string'
        )
          throw new Error('Invalid turn order');
        if (!item.committed) {
          // Optional links fall back to ordered data-channel commit arrival, never completion arrival.
          item.previous =
            event.previous_item_id === undefined
              ? committedTail
              : event.previous_item_id;
          item.committed = true;
          committedTail = id;
        }
      } else if (
        event.type === 'conversation.item.input_audio_transcription.delta'
      ) {
        if (event.delta === undefined) return;
        if (typeof event.delta !== 'string') throw new Error('Invalid delta');
        item.partial = bounded(item.partial + event.delta);
      } else if (
        event.type === 'conversation.item.input_audio_transcription.completed'
      ) {
        if (typeof event.transcript !== 'string')
          throw new Error('Invalid final');
        item.final ??= event.transcript;
      } else return;
      items.set(id, item);
      if (items.size > 100 || seen.size > 1_000)
        throw new Error('Too many turns');
      for (;;) {
        const next = [...items.entries()].find(
          ([, value]) =>
            value.committed &&
            value.previous === last &&
            value.final !== undefined
        );
        if (!next) break;
        const [key, value] = next;
        items.delete(key);
        seen.add(key);
        last = key;
        // Remove the provisional copy before committing corrected text to the draft.
        interim();
        events.final(value.final!);
      }
      interim();
    }
  };
}
