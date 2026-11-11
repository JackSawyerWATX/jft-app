import 'server-only';
import { parsePersistenceConfig } from '../../../config/runtime';
import type { ShareRepository } from './repository';
import { InMemoryShareRepository } from './memory-repository';
import { DynamoDbShareRepository } from './dynamodb-repository';

/** Select storage without contacting AWS; invalid settings throw before use. */
export function createShareRepository(
  env: Readonly<Record<string, string | undefined>> = process.env
): ShareRepository {
  const config = parsePersistenceConfig(env);
  return config.SHARE_PERSISTENCE === 'memory'
    ? new InMemoryShareRepository()
    : DynamoDbShareRepository.forRegion(
        config.DYNAMODB_TABLE_NAME,
        config.DYNAMODB_REGION
      );
}
const processState = globalThis as typeof globalThis & {
  doorknobShareRepository?: ShareRepository;
};
function currentRepository() {
  return (processState.doorknobShareRepository ??= createShareRepository());
}
/** Process-local wiring; the DynamoDB adapter shares durable data across instances. */
export const shareRepository: ShareRepository = {
  create: (ownerId, text) => currentRepository().create(ownerId, text),
  listByOwner: (ownerId, options) =>
    currentRepository().listByOwner(ownerId, options),
  findByOwner: (id, ownerId) => currentRepository().findByOwner(id, ownerId),
  findById: (id) => currentRepository().findById(id)
};
