import { parse } from '@aws-sdk/util-arn-parser';

/** Parse regional secret metadata without reading credentials. Throws for invalid ARNs. */
export function parseSecretArn(value: string) {
  const arn = parse(value);
  if (
    arn.service !== 'secretsmanager' ||
    !arn.region ||
    !arn.resource.startsWith('secret:') ||
    arn.resource === 'secret:'
  ) {
    throw new Error('Expected a regional Secrets Manager secret ARN.');
  }
  return arn;
}
