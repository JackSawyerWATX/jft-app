'use client';

import { useSyncExternalStore } from 'react';
import { reflection } from '../reflection-fixture';
import { readingDateLabel } from '../dates';

function currentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function subscribeToDate(onChange: () => void) {
  const interval = window.setInterval(onChange, 1000);
  window.addEventListener('focus', onChange);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', onChange);
  };
}

const serverDate = () => '';

export function ReflectionReading() {
  const today = useSyncExternalStore(subscribeToDate, currentDate, serverDate);
  return (
    <section className="reading text-center" aria-label="Today's reflection">
      <p className="eyebrow">
        Sample reading{today ? ` · ${readingDateLabel(today)}` : ''}
      </p>
      <p className="mt-6 font-serif text-[27px] leading-snug sm:text-3xl">
        {reflection.title}
      </p>
      <div className="divider" />
      <p className="reading-body">{reflection.body}</p>
    </section>
  );
}
