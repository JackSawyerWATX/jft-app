import { reflection } from '../reflection-fixture';
import { readingDateLabel } from '../dates';

export function ReflectionReading() {
  return (
    <section className="reading text-center" aria-label="Today's reflection">
      <p className="eyebrow">{readingDateLabel(reflection.date)}</p>
      <p className="mt-6 font-serif text-[27px] leading-snug sm:text-3xl">
        {reflection.title}
      </p>
      <div className="divider" />
      <p className="reading-body">{reflection.body}</p>
      <p className="eyebrow mt-5">A thought for today</p>
    </section>
  );
}
