/** Show the complete thoughts on owner and recipient detail pages. */
export function ThoughtsText({ text }: { text: string }) {
  return (
    <div className="mt-3">
      <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
        {text}
      </p>
    </div>
  );
}
