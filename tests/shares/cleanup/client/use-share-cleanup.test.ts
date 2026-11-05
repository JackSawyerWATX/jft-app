import { dom } from '../../transcription/client/dom';
import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useShareCleanup } from '../../../../src/shares/cleanup/use-share-cleanup';

afterEach(cleanup);
after(() => dom.window.close());
function setup() {
  const jobs: {
    text: string;
    signal: AbortSignal;
    resolve: (text: string) => void;
    reject: () => void;
  }[] = [];
  const request = (text: string, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) =>
      jobs.push({
        text,
        signal,
        resolve,
        reject: () => reject(new Error('private provider details'))
      })
    );
  const hook = renderHook(() => {
    const [text, setText] = useState('Um, fictional words. More words.');
    return { text, ...useShareCleanup(text, setText, request) };
  });
  return { ...hook, jobs };
}

test('successful cleanup replaces the draft and releases the pending state', async () => {
  const s = setup();
  const original = s.result.current.text;
  let job!: Promise<void>;
  act(() => {
    job = s.result.current.run(original);
  });
  assert.equal(s.result.current.pending, true);
  await act(async () => {
    s.jobs[0].resolve('Fictional words.\n\nMore words.');
    await job;
  });
  assert.equal(s.result.current.text, 'Fictional words.\n\nMore words.');
  assert.equal(s.result.current.state.status, 'idle');
  assert.equal(s.result.current.pending, false);
});

test('manual edits cancel pending cleanup and late results cannot overwrite those edits', async () => {
  const s = setup();
  let job!: Promise<void>;
  act(() => {
    job = s.result.current.run(s.result.current.text);
  });
  act(() => s.result.current.edit('New typed words.'));
  assert.equal(s.jobs[0].signal.aborted, true);
  await act(async () => {
    s.jobs[0].resolve('Stale cleanup.');
    await job;
  });
  assert.equal(s.result.current.text, 'New typed words.');
  assert.equal(s.result.current.pending, false);
});

test('failure preserves originals and a later retry can succeed', async () => {
  const s = setup();
  let job!: Promise<void>;
  const original = s.result.current.text;
  act(() => {
    job = s.result.current.run(original);
  });
  await act(async () => {
    s.jobs[0].reject();
    await job;
  });
  assert.equal(s.result.current.text, original);
  assert.equal(s.result.current.state.status, 'failed');
  act(() => {
    job = s.result.current.run(original);
  });
  await act(async () => {
    s.jobs[1].resolve('A tidied draft.');
    await job;
  });
  assert.equal(s.result.current.text, 'A tidied draft.');
  act(() => s.result.current.edit('Manually revised.'));
  assert.equal(s.result.current.text, 'Manually revised.');
});

test('navigation cancellation and unmount silence even requests that ignore AbortSignal', async () => {
  const s = setup();
  let job!: Promise<void>;
  act(() => {
    job = s.result.current.run(s.result.current.text);
  });
  act(() => s.result.current.cancel());
  assert.equal(s.jobs[0].signal.aborted, true);
  await act(async () => {
    s.jobs[0].resolve('Stale navigation result.');
    await job;
  });
  assert.equal(s.result.current.state.status, 'idle');
  act(() => {
    job = s.result.current.run(s.result.current.text);
  });
  s.unmount();
  assert.equal(s.jobs[1].signal.aborted, true);
  await act(async () => {
    s.jobs[1].resolve('Stale unmounted result.');
    await job;
  });
});

test('an old request cannot replace a newer cleanup or clear its pending state', async () => {
  const s = setup();
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = s.result.current.run(s.result.current.text);
    second = s.result.current.run(s.result.current.text);
  });
  await act(async () => {
    s.jobs[0].resolve('Old result.');
    await first;
  });
  assert.equal(s.result.current.pending, true);
  await act(async () => {
    s.jobs[1].resolve('Newest result.');
    await second;
  });
  assert.equal(s.result.current.text, 'Newest result.');
});

test('a timeout releases the UI and cannot apply a late result even if the transport ignores cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  const original = s.result.current.text;
  let job!: Promise<void>;
  act(() => {
    job = s.result.current.run(original);
  });
  act(() => t.mock.timers.tick(30_000));
  assert.equal(s.result.current.pending, false);
  assert.equal(s.result.current.state.status, 'failed');
  assert.equal(s.jobs[0].signal.aborted, true);
  await act(async () => {
    s.jobs[0].resolve('Late response.');
    await job;
  });
  assert.equal(s.result.current.text, original);
  assert.equal(s.result.current.state.status, 'failed');
});
