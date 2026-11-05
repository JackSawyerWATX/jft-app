import { dispatch } from '../../../../shares/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Credential issuance is documented and dispatched by the BFF operation. */
export const POST = dispatch;
export const GET = dispatch;
export const HEAD = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
