import { ShareApp } from '../shares/share-app';

/** Keeps the route entry separate from the browser-only reflection experience. */
export default function Home() {
  return <ShareApp />;
}
