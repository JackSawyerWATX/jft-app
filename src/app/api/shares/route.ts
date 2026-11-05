/** Next.js adapter; list/create contracts and handlers live in src/shares/server/http/operations/. */
export {
  dispatch as GET,
  dispatch as POST,
  dispatch as HEAD,
  dispatch as OPTIONS,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE
} from '../../../shares/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
