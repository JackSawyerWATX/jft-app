// Never let a developer's deployment settings turn unit tests into AWS requests.
process.env.SHARE_PERSISTENCE = 'memory';
