/** Classify browser diagnostics without retaining messages, which may contain sensitive data. */
export type BrowserErrorKind = 'pageerror' | 'console';
export interface ExpectedBrowserError {
  kind: BrowserErrorKind;
  pattern: RegExp;
  reason: string;
}

export function browserErrorCategory(
  kind: BrowserErrorKind,
  message: string,
  expected: ExpectedBrowserError[],
  observedHttpFailure = false
) {
  if (
    expected.some(
      (entry) =>
        entry.kind === kind &&
        entry.reason.trim() &&
        new RegExp(
          entry.pattern.source,
          entry.pattern.flags.replace(/[gy]/g, '')
        ).test(message)
    )
  )
    return undefined;
  if (kind === 'pageerror') return 'uncaught browser exception';
  if (
    /hydrat|server rendered HTML|server-rendered HTML|did not match/i.test(
      message
    )
  )
    return 'hydration mismatch';
  // Browsers log HTTP failures for the intentionally exercised API/error-page paths.
  // Endpoint tests assert those statuses; missing scripts/styles and other console errors still fail.
  if (
    observedHttpFailure &&
    /^Failed to load resource: the server responded with a status of (400|403|404|405|413|415|429|500|502|503)\b/.test(
      message
    )
  )
    return undefined;
  return 'unexpected console error';
}
