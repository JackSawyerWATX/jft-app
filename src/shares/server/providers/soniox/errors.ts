/** App-authored diagnostic categories; never retain upstream bodies or errors. */
export class SonioxCredentialError extends Error {
  constructor(
    readonly reason:
      | 'provider_timeout'
      | 'provider_connection_failure'
      | 'provider_request_failed'
      | 'invalid_provider_response',
    readonly status?: number
  ) {
    super('Soniox credential unavailable');
  }
}
