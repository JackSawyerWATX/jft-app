// Explicit synthetic selection for server tests; keep OpenAI contract fixtures independent of the Soniox production default.
process.env.STT_PROVIDER = 'openai';
