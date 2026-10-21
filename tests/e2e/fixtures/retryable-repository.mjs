// Loaded only by the isolated error-page test, before Next imports the repository.
let failed = false;
globalThis.doorknobShareRepository = {
  async findById() {
    if (!failed) {
      failed = true;
      throw new Error('Fictional raw repository failure');
    }
    return null;
  }
};
