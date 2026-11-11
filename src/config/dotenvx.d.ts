declare module '@dotenvx/primitives' {
  const source: { upsert(content: string, key: string, value: string): string };
  export default source;
}
