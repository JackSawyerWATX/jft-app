/** Show the complete thoughts as readable paragraphs on owner and recipient detail pages. */
export function ThoughtsText({ text }: { text: string }) {
  return (
    <div className="thoughts-text mt-3 space-y-5 sm:space-y-4">
      {text
        .split(/\r?\n\s*\r?\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p
            key={index}
            className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed"
          >
            {paragraph}
          </p>
        ))}
    </div>
  );
}
