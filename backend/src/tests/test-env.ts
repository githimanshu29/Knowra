// Test runner to verify environment variables parsing and Zod validation
import { env } from '../config/env.js';

console.log('✅ Env Validated Successfully!');
console.log(`Port: ${env.PORT}`);
console.log(`Database URL: ${env.DATABASE_URL}`);
console.log(`Embedding Model: ${env.EMBEDDING_MODEL} (Dimension: ${env.EMBEDDING_DIMENSION})`);
