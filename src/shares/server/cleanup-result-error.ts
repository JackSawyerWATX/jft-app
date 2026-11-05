import 'server-only';

/** App-authored result categories only; never retain provider output or raw validation errors. */
export class CleanupResultError extends Error {
  constructor(
    readonly reason:
      | 'cleanup_not_completed'
      | 'cleanup_refused'
      | 'missing_cleanup_output'
      | 'invalid_cleanup_output',
    readonly detail?: 'max_output_tokens' | 'content_filter'
  ) {
    super('Cleanup result unavailable');
  }
}
