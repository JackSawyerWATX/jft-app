import { expect, test } from './fixtures/test';

import { mockSpeech, emit } from './fixtures/openai-browser';

test('dictation combines with inline editing, repeated sessions, saving, history and recipient reading', async ({
  page,
  browser,
  watchPage,
  baseURL
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await expect(
    page.getByText('Speak from your own experience', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Tap the microphone to begin.', { exact: true })
  ).toBeVisible();
  await page.getByRole('textbox').fill('Typed fictional thought.');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(page.getByText('Connecting transcription…')).toBeVisible();
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
  const recipient = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const reader = await recipient.newPage();
    watchPage(reader);
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
  for (const error of ['network', 'private provider failure']) {
    await page.getByRole('button', { name: 'Record your share' }).click();
    await emit(page, 'speechError', error);
    await expect(
      page.getByText(/Speech recognition could not continue/)
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
      RTCPeerConnection: undefined
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
  await mockSpeech(page);
  const logs: string[] = [];
  // Serialize in the originating page: remote object handles expire during navigation.
  await page.addInitScript(() => {
    const info = console.info.bind(console);
    console.info = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].startsWith('[Doorknob speech]')
      )
        info(JSON.stringify(args));
      else info(...args);
    };
  });
  page.on('console', (message) => {
    if (message.text().startsWith('["[Doorknob speech]'))
      logs.push(message.text());
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
    'recognition-start',
    'provider-event',
    'final-committed',
    'dispose'
  ])
    expect(all).toContain(event);
  expect(all).toContain('provider');
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

test('stop discards provisional text while microphone capture failures retain finalized text', async ({
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
  await emit(page, 'speechError', 'network');
  await expect(
    page.getByText(/Speech recognition could not continue/)
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(
    'Final fictional sentence.'
  );
  await expect(
    page.getByText('Unfinished words.', { exact: true })
  ).toHaveCount(0);
  await page.evaluate(() =>
    Reflect.set(window, 'microphoneError', 'NotReadableError')
  );
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByText(
      'Microphone unavailable. Check that a microphone is connected and another app is not using it, then try again.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(
    'Final fictional sentence.'
  );
});

test('microphone denial retains typing and stop accepts corrected final words without saving provisional text', async ({
  page
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByRole('textbox').fill('Typed fictional words.');
  await page.evaluate(() =>
    Reflect.set(window, 'microphoneError', 'NotAllowedError')
  );
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('Typed fictional words.');
  await page.evaluate(() => Reflect.set(window, 'microphoneError', ''));
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [['uncorrected provisional', false]]);
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
  await emit(page, 'speechResult', [['Corrected, punctuated final.', true]]);
  await emit(page, 'speechEnd');
  await expect(page.getByRole('textbox')).toHaveValue(
    'Typed fictional words.\n\nCorrected, punctuated final.'
  );
  await expect(
    page.getByText('uncorrected provisional', { exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('backgrounding releases the microphone and retains finalized text', async ({
  page
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [
    ['Final fictional words.', true],
    ['Provisional words.', false]
  ]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText(/Recording was interrupted/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('Final fictional words.');
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
  await expect(
    page.getByText('Provisional words.', { exact: true })
  ).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    })
  );
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText(/Recording was interrupted/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeEnabled();
});

test('unconfigured real credential endpoint releases capture and preserves typed saving', async ({
  page
}) => {
  await mockSpeech(page);
  await page.unroute('**/api/transcription/session');
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('Fictional typed fallback without provider access.');
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeEnabled();
  const denied = page.waitForResponse((response) =>
    response.url().endsWith('/api/transcription/session')
  );
  await page.getByRole('button', { name: 'Record your share' }).click();
  expect((await denied).status()).toBe(503);
  await expect(
    page.getByText(
      'Transcription is unavailable. You can still type and save your share.',
      { exact: true }
    )
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
});

for (const action of ['cancel', 'hide', 'navigate'] as const) {
  test(`pending microphone permission after ${action} releases a late grant without starting transport`, async ({
    page
  }) => {
    await mockSpeech(page);
    await page.goto('/');
    await page.getByRole('textbox').fill('Existing fictional words.');
    await page.evaluate(() => Reflect.set(window, 'permissionPending', true));
    await page.getByRole('button', { name: 'Record your share' }).click();
    expect(
      await page.evaluate(() => Reflect.get(window, 'microphoneRequests'))
    ).toBe(1);
    if (action === 'cancel')
      await page.getByRole('button', { name: 'Cancel microphone' }).click();
    else if (action === 'navigate')
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Past shares' })
        .click();
    else
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden'
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    await page.evaluate(() => Reflect.get(window, 'grantMicrophone')());
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'aborted')))
      .toBe(true);
    expect(
      await page.evaluate(() => Reflect.get(window, 'speechReady'))
    ).toBeUndefined();
    if (action === 'navigate')
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Today’s reflection' })
        .click();
    await expect(page.getByRole('textbox')).toHaveValue(
      'Existing fictional words.'
    );
  });
}

test('permission granted shows cancellable connection progress, without claiming to listen before the transport opens', async ({
  page
}) => {
  await mockSpeech(page);
  let release!: () => void,
    completed = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/transcription/session', async (route) => {
    await pending;
    try {
      await route.fulfill({
        json: { value: 'ephemeral-fiction', expires_at: 123 }
      });
    } catch {
      /* The canceled startup is allowed to abort this request. */
    }
    completed = true;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Record your share' }).click();
  await expect(
    page.getByText('Connecting transcription…', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Listening...', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Listening time')).toHaveText('00:00');
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, 'aborted'))).toBe(true);
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(page.getByText('Listening...', { exact: true })).toHaveCount(0);
});

test('recording waits for private-session bootstrap before a parallel credential request can start', async ({
  page
}) => {
  await mockSpeech(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/shares', async (route) => {
    if (route.request().method() === 'GET') {
      await pending;
      await route.fulfill({ json: [] });
    } else await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeDisabled();
  expect(
    await page.evaluate(() => Reflect.get(window, 'microphoneRequests'))
  ).toBeUndefined();
  release();
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeEnabled();
});
