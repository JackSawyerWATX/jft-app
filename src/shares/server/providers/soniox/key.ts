import 'server-only';
import { secretKey } from '../../secret-key';

/** Direct Soniox keys are for local development; deployed reads use the role. */
export async function sonioxKey(): Promise<string> {
  if (process.env.NODE_ENV !== 'production' && process.env.STT_SONIOX_API_KEY) {
    return process.env.STT_SONIOX_API_KEY;
  }
  return secretKey(process.env.STT_SONIOX_SECRET_ARN);
}
