import { createShareSchema } from '../model';

/** Cleanup accepts and returns the same bounded, nonblank text as a draft; it never changes the saved share model. */
export const cleanupTextSchema = createShareSchema;

export type CleanupStatus = 'idle' | 'pending' | 'failed';
