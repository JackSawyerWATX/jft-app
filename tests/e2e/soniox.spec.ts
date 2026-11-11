import { test, expect, type Page } from './fixtures/test';

test.skip(
  process.env.STT_PROVIDER !== 'soniox',
  'Run with STT_PROVIDER=soniox against its runtime bootstrap'
);

async function mockSoniox(page: Page) {
  await page.route('**/api/transcription/session', (route) => {
    expect(route.request().headers()['x-stt-provider']).toBe('soniox');
    return route.fulfill({
      json: { value: 'synthetic-temporary', expires_at: 9999999999 }
    });
  });
  await page.route('**/api/shares/cleanup', (route) =>
    route.fulfill({ json: { text: route.request().postDataJSON().text } })
  );
  await page.addInitScript(() => {
    const sockets: Socket[] = [];
    class Track extends EventTarget {
      stop() {
        Reflect.set(window, 'captureStopped', true);
      }
    }
    const track = new Track();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          Reflect.set(
            window,
            'microphoneRequests',
            (Reflect.get(window, 'microphoneRequests') ?? 0) + 1
          );
          Reflect.set(window, 'captureStopped', false);
          if (Reflect.get(window, 'denyMicrophone'))
            throw new DOMException('synthetic denial', 'NotAllowedError');
          return { getTracks: () => [track], getAudioTracks: () => [track] };
        }
      }
    });
    class Recorder extends EventTarget {
      state = 'inactive';
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    }
    class Socket extends EventTarget {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 0;
      constructor() {
        super();
        sockets.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event('open'));
        }, 0);
      }
      send(data: unknown) {
        if (data === '') Reflect.set(window, 'finishRequested', true);
      }
      close() {
        this.readyState = 3;
      }
    }
    Object.assign(window, {
      MediaRecorder: Recorder,
      WebSocket: Socket,
      sonioxResult: (tokens: unknown[], finished = false) =>
        sockets.at(-1)!.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({
              tokens,
              final_audio_proc_ms: 100,
              total_audio_proc_ms: 100,
              finished
            })
          })
        ),
      interruptMicrophone: () => track.dispatchEvent(new Event('mute'))
    });
  });
}
async function result(
  page: Page,
  parts: [string, boolean][],
  finished = false
) {
  await page.evaluate(
    ({ parts, finished }) =>
      Reflect.get(window, 'sonioxResult')(
        parts.map(([text, is_final]) => ({ text, is_final, confidence: 1 })),
        finished
      ),
    { parts, finished }
  );
}

test('Soniox streams provisional words, drains Stop, repeats sessions, edits, saves and shares', async ({
  page,
  browser,
  baseURL,
  watchPage
}) => {
  await mockSoniox(page);
  await page.goto('/');
  expect(
    await page.evaluate(() => Reflect.get(window, 'microphoneRequests') ?? 0)
  ).toBe(0);
  await page.getByRole('textbox').fill('Typed fiction.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop listening' })
  ).toBeVisible();
  await result(page, [['Draft guess', false]]);
  await expect(page.getByText('Draft guess', { exact: false })).toBeVisible();
  await result(page, [['Hel', true]]);
  await result(page, [
    ['lo', true],
    [' wrong', false]
  ]);
  await result(page, [
    [',', true],
    [' world', true]
  ]);
  await page.getByRole('button', { name: 'Stop listening' }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'captureStopped'))).toBe(
    true
  );
  await result(page, [['!', true]], true);
  await expect(page.getByRole('textbox')).toHaveValue(
    'Typed fiction.\n\nHello, world!'
  );
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeEnabled();
  await page.getByRole('textbox').fill('Edited fiction.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop listening' })
  ).toBeVisible();
  for (const fragment of ['Another', ' ', 'reflection', '.']) {
    await result(page, [[fragment, true]]);
  }
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await result(page, [], true);
  await expect(page.getByRole('textbox')).toHaveValue(
    'Edited fiction.\n\nAnother reflection.'
  );
  const savedResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/shares')
  );
  await page.getByRole('button', { name: 'Save privately' }).click();
  const saved = await (await savedResponse).json();
  expect(saved.text).toBe('Edited fiction.\n\nAnother reflection.');
  const recipient = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const reader = await recipient.newPage();
    watchPage(reader);
    await reader.goto(new URL(saved.shareUrl, baseURL).href);
    await expect(reader.getByLabel('Shared thoughts')).toContainText(
      'Another reflection.'
    );
  } finally {
    await recipient.close();
  }
});

test('Soniox permission denial and microphone interruption release capture and preserve final text', async ({
  page
}) => {
  await mockSoniox(page);
  await page.goto('/');
  await page.evaluate(() => Reflect.set(window, 'denyMicrophone', true));
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'denyMicrophone', false));
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop listening' })
  ).toBeVisible();
  await result(page, [['Keep this.', true]]);
  await page.evaluate(() => Reflect.get(window, 'interruptMicrophone')());
  await expect(page.getByText(/Recording was interrupted/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('Keep this.');
  expect(await page.evaluate(() => Reflect.get(window, 'captureStopped'))).toBe(
    true
  );
});

test('Soniox credential refusal stops capture and leaves typed words editable', async ({
  page
}) => {
  await mockSoniox(page);
  await page.route('**/api/transcription/session', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'TRANSCRIPTION_UNAVAILABLE',
          message: 'Transcription unavailable'
        }
      }
    })
  );
  await page.goto('/');
  await page.getByRole('textbox').fill('Keep typed fiction.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByText(/Speech recognition could not continue/)
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('Keep typed fiction.');
  expect(await page.evaluate(() => Reflect.get(window, 'captureStopped'))).toBe(
    true
  );
});
