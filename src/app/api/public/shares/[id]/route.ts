/** Next.js Node adapter for the OpenAPI-defined sharing operations. */
export {
  dispatch as GET,
  dispatch as HEAD,
  dispatch as OPTIONS,
  dispatch as POST,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE
} from '../../../../../shares/server/app';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
