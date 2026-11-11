'use client';

import { createContext, type ReactNode } from 'react';
import type { TranscriptionProvider } from './config';

/** Runtime server bootstrap only. No user-facing provider selection. */
export const TranscriptionProviderContext =
  createContext<TranscriptionProvider | null>(null);

/** Serialize only the validated provider from the server, keeping context creation in the client. */
export function TranscriptionBootstrap({
  provider,
  children
}: {
  provider: TranscriptionProvider;
  children: ReactNode;
}) {
  return (
    <TranscriptionProviderContext value={provider}>
      {children}
    </TranscriptionProviderContext>
  );
}
