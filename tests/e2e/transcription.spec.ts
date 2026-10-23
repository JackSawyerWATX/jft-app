import { expect, test, type Page } from '@playwright/test';

async function mockSpeech(page: Page, prefixed = false) {
  await page.addInitScript(
    ({ prefixed }) => {
      class Speech {
        onaudiostart?: () => void;
        onspeechstart?: () => void;
        onspeechend?: () => void;
        onstart?: () => void;
        onend?: () => void;
        onresult?: (event: unknown) => void;
        onerror?: (event: unknown) => void;
        static current: Speech;
        start() {
          Speech.current = this;
        }
        stop() {
          /* Tests explicitly emit final results before end. */
        }
        abort() {
          Object.assign(window, { aborted: true });
        }
      }
      Object.assign(window, {
        SpeechRecognition: prefixed ? undefined : Speech,
        webkitSpeechRecognition: prefixed ? Speech : undefined,
        speechStart: () => Speech.current.onstart?.(),
        speechAudio: () => Speech.current.onaudiostart?.(),
        speechActivity: (active: boolean) =>
          active
            ? Speech.current.onspeechstart?.()
            : Speech.current.onspeechend?.(),
        speechEnd: () => Speech.current.onend?.(),
        speechError: (error: string) => Speech.current.onerror?.({ error }),
        speechResult: (segments: [string, boolean][]) =>
          Speech.current.onresult?.({
            resultIndex: 0,
            results: segments.map(([transcript, isFinal]) => ({
              isFinal,
              0: { transcript }
            }))
          }),
        captureStale: () => {
          const callback = Speech.current.onresult;
          Object.assign(window, {
            stale: () =>
              callback?.({
                resultIndex: 0,
                results: [
                  { isFinal: true, 0: { transcript: 'Stale fictional text' } }
                ]
              })
          });
        }
      });
    },
    { prefixed }
  );
}
async function emit(page: Page, name: string, value?: unknown) {
  await page.evaluate(({ name, value }) => Reflect.get(window, name)(value), {
    name,
    value
  });
}

test('dictation combines with inline editing, repeated sessions, saving, history and recipient reading', async ({
  page,
  browser,
  baseURL
}) => {
  await mockSpeech(page, true);
  await page.goto('/');
  await expect(
    page.getByText('Speak from your own experience', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Tap the microphone to begin.', { exact: true })
  ).toBeVisible();
  await page.getByRole('textbox').fill('Typed fictional thought.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(page.getByText('Waiting for microphone access…')).toBeVisible();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [['Provisional fiction', false]]);
  await expect(
    page.getByText('Provisional fiction', { exact: false })
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(
    'Typed fictional thought.'
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem('doorknob:share-draft'))
  ).toBeNull();
  await emit(page, 'speechResult', [
    ['Final fiction.', true],
    ['More provisional', false]
  ]);
  await emit(page, 'speechResult', [
    ['Final fiction.', true],
    ['More fiction.', true]
  ]);
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeDisabled();
  await emit(page, 'speechEnd');
  const draft = 'Typed fictional thought.\n\nFinal fiction. More fiction.';
  await expect(page.getByRole('textbox')).toHaveValue(draft);
  await page.getByRole('textbox').fill(draft + ' Edited.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [['Another session.', true]]);
  await emit(page, 'speechEnd');
  const combined = draft + ' Edited.\n\nAnother session.';
  await expect(page.getByRole('textbox')).toHaveValue(combined);
  const savedResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/shares')
  );
  await page.getByRole('button', { name: 'Save privately' }).click();
  const saved = await (await savedResponse).json();
  expect(saved.kind).toBe('text');
  expect(saved.text).toBe(combined);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toContainText('Another session.');
  const recipient = await browser.newContext();
  try {
    const reader = await recipient.newPage();
    await reader.goto(new URL(saved.shareUrl, baseURL).href);
    await expect(reader.getByLabel('Shared thoughts')).toContainText(
      'Another session.'
    );
  } finally {
    await recipient.close();
  }
});

test('permission/service errors recover, navigation cleans up, stale callbacks are ignored', async ({
  page
}) => {
  await mockSpeech(page);
  await page.goto('/');
  for (const error of ['not-allowed', 'network']) {
    await page.getByRole('button', { name: 'Record your share' }).click();
    await emit(page, 'speechError', error);
    await expect(
      page.getByText(
        error === 'not-allowed'
          ? /Microphone access was denied/
          : /Speech recognition could not continue/
      )
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'captureStale');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares' })
    .click();
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Today’s reflection' })
    .click();
  await emit(page, 'stale');
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechEnd');
  await expect(page.getByText(/Tap to record more/)).toBeVisible();
});

test('unsupported browsers keep typing and saving', async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      SpeechRecognition: undefined,
      webkitSpeechRecognition: undefined
    })
  );
  await page.goto('/');
  await expect(
    page.getByText('Sorry, transcription is unavailable for your browser!')
  ).toBeVisible();
  await page.getByRole('textbox').fill('Fictional typed fallback.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
});

test('dictation limit stops recognition and retains the draft without accepting stale results', async ({
  page
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByRole('textbox').fill('🌱'.repeat(9995));
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'captureStale');
  await emit(page, 'speechResult', [['Fictional speech beyond limit.', true]]);
  await expect(
    page.getByText(/reached the 10,000 character limit/)
  ).toBeVisible();
  await emit(page, 'stale');
  expect(await page.getByRole('textbox').inputValue()).toBe(
    '🌱'.repeat(9995) + '\n\nFic'
  );
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
});

test('opt-in diagnostics trace recognition without exposing transcripts or raw errors', async ({
  page
}) => {
  await mockSpeech(page, true);
  const logs: string[] = [];
  page.on('console', async (message) => {
    if (message.text().startsWith('[Doorknob speech]')) {
      const details = await Promise.all(
        message.args().map((arg) => arg.jsonValue())
      );
      logs.push(JSON.stringify(details));
    }
  });
  await page.goto('/?speechDebug=1');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechAudio');
  await emit(page, 'speechResult', [['Private fictional provisional', false]]);
  await emit(page, 'speechResult', [['Private fictional final', true]]);
  await emit(page, 'speechError', 'private vendor error details');
  await expect.poll(() => logs.join(' ')).toContain('recognition-error');
  const all = logs.join(' ');
  for (const event of [
    'availability',
    'editor-start',
    'start-requested',
    'start-returned',
    'recognition-start',
    'audio-start',
    'results',
    'final-committed',
    'dispose'
  ])
    expect(all).toContain(event);
  expect(all).toContain('unknown');
  expect(all).toContain('prefixed');
  expect(all).not.toContain('Private fictional');
  expect(all).not.toContain('private vendor');
  await page.goto('/');
  await expect
    .poll(() => logs.filter((log) => log.includes('availability')).length)
    .toBeGreaterThan(2);
  await page.goto('/?speechDebug=0');
  const before = logs.length;
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechEnd');
  await expect(page.getByText(/Tap to record more/)).toBeVisible();
  expect(logs.length).toBe(before);
});

test('URL diagnostics work when sessionStorage is blocked', async ({
  page
}) => {
  await mockSpeech(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      }
    })
  );
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith('[Doorknob speech]'))
      messages.push(message.text());
  });
  await page.goto('/?speechDebug=1');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechEnd');
  await expect.poll(() => messages.join(' ')).toContain('recognition-end');
});

test('large microphone reacts to speech and pauses while the prompter follows words and respects scrollback', async ({
  page
}) => {
  await mockSpeech(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const record = page.getByRole('button', { name: 'Record your share' });
  const size = await record.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(132);
  expect(size!.height).toBe(size!.width);
  const studio = page.locator('.voice-studio');
  const prompter = page.getByRole('region', { name: 'Live share transcript' });
  await page
    .getByRole('textbox')
    .fill(
      Array.from({ length: 35 }, (_, i) => `Fictional line ${i}.`).join('\n')
    );
  await expect
    .poll(() =>
      prompter.evaluate(
        (e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 2
      )
    )
    .toBe(true);
  await record.click();
  await emit(page, 'speechStart');
  await expect(studio).toHaveAttribute('data-speaking', 'false');
  await expect(page.getByText('Listening...', { exact: true })).toBeVisible();
  await emit(page, 'speechActivity', true);
  await expect(studio).toHaveAttribute('data-speaking', 'true');
  expect(
    await page
      .locator('.speech-bars span')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName)
  ).toBe('none');
  await emit(page, 'speechActivity', false);
  await expect(studio).toHaveAttribute('data-speaking', 'false');
  await prompter.evaluate((e) => {
    e.scrollTop = 0;
    e.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await emit(page, 'speechResult', [['Provisional fictional words.', false]]);
  await expect(studio).toHaveAttribute('data-speaking', 'true');
  await expect(prompter).toContainText('Provisional fictional words.');
  expect(await prompter.evaluate((e) => e.scrollTop)).toBe(0);
  await prompter.evaluate((e) => {
    e.scrollTop = 60;
    e.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await emit(page, 'speechResult', [['More fictional final words.', true]]);
  expect(await prompter.evaluate((e) => e.scrollTop)).toBe(60);

  await expect(page.getByRole('button', { name: 'Latest words' })).toHaveCount(
    0
  );
  await prompter.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
    e.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect
    .poll(() =>
      prompter.evaluate(
        (e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 2
      )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await emit(page, 'speechEnd');
  await expect(studio).toHaveAttribute('data-speaking', 'false');
  await expect(studio).toHaveAttribute('data-paused', 'true');
  await expect(prompter).not.toContainText('Provisional fictional words.');
  await page.getByRole('textbox').fill('Edited fictional share.');
  await expect(prompter.getByRole('textbox')).toHaveValue(
    'Edited fictional share.'
  );
});

test('teleprompter resizes existing text after viewport changes without clipping or losing words', async ({
  page
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'Your share' });
  const text =
    'A fictional reflection on taking a small step and making room for acceptance. '.repeat(
      55
    );
  await field.fill(text);
  const wideHeight = await field.evaluate((e) => e.clientHeight);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(() => field.evaluate((e) => e.clientHeight))
    .toBeGreaterThan(wideHeight);
  expect(
    await field.evaluate((e) => e.scrollHeight <= e.clientHeight + 2)
  ).toBe(true);
  await expect(field).toHaveValue(text);
  const prompter = page.getByRole('region', { name: 'Live share transcript' });
  await expect
    .poll(() =>
      prompter.evaluate(
        (e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 2
      )
    )
    .toBe(true);
  await prompter.evaluate((e) => {
    e.scrollTop = 60;
    e.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await expect
    .poll(() => field.evaluate((e) => e.scrollHeight <= e.clientHeight + 2))
    .toBe(true);
  expect(await prompter.evaluate((e) => e.scrollTop)).toBe(60);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect
    .poll(() => field.evaluate((e) => e.clientHeight))
    .toBeLessThan(wideHeight + 2);
  await expect(field).toHaveValue(text);
});

test('silence stops normally while audio-capture errors suggest checking the microphone', async ({
  page
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [
    ['Final fictional sentence.', true],
    ['Unfinished words.', false]
  ]);
  await emit(page, 'speechError', 'no-speech');
  await expect(
    page.getByText('Tap to record more.', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(
    'Final fictional sentence.'
  );
  await expect(
    page.getByText('Unfinished words.', { exact: true })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechError', 'audio-capture');
  await expect(
    page.getByText(
      'Microphone audio is unavailable. Check your microphone and browser settings, then try again.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(
    'Final fictional sentence.'
  );
});
