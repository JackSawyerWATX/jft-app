import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenAIProtocol } from '../../../src/shares/transcription/providers/openai/protocol';

test('duplicate item acknowledgements cannot settle a second outstanding audio commit', () => {
  const finals: string[] = [];
  const protocol = createOpenAIProtocol({
    listening() {},
    interim() {},
    final: (text) => finals.push(text),
    error() {},
    ended() {}
  });
  const accept = (event: object) =>
    protocol.accept(event as Record<string, unknown>);
  protocol.commitRequested();
  protocol.commitRequested();
  accept({
    type: 'input_audio_buffer.committed',
    item_id: 'a',
    previous_item_id: null,
    event_id: 'ack-a'
  });
  accept({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'a',
    transcript: 'First.'
  });
  accept({
    type: 'input_audio_buffer.committed',
    item_id: 'a',
    previous_item_id: null,
    event_id: 'repeated-ack-a'
  });
  assert.equal(protocol.pending(), true);
  accept({
    type: 'input_audio_buffer.committed',
    item_id: 'b',
    previous_item_id: 'a'
  });
  assert.equal(protocol.pending(), true);
  accept({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'b',
    transcript: 'Second.'
  });
  assert.equal(protocol.pending(), false);
  assert.deepEqual(finals, ['First.', 'Second.']);
});
