// Verification script for Drizzle Schema and Relational Query API
import { db, pool } from './db/index.js';

console.log('✅ Drizzle Schema & Relational API Loaded Successfully!');
console.log('Registered Tables in DB Client:', Object.keys(db.query));

// Pool connection safely end karna
await pool.end();
