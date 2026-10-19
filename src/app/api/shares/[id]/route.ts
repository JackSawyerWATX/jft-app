/** Next.js adapter; read contract and handler live in src/shares/server/operations/read-share.ts. */
export {
  dispatch as GET,
  dispatch as HEAD,
  dispatch as OPTIONS,
  dispatch as POST,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE
} from '../../../../shares/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
