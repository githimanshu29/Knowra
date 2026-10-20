// Test script to verify PostgreSQL database connectivity
import { checkDatabaseConnection, closeDatabaseConnection } from './db/index.js';

async function main() {
  console.log('🔍 Testing PostgreSQL connection...');
  const isConnected = await checkDatabaseConnection();

  if (isConnected) {
    console.log('✅ PostgreSQL Connected successfully!');
  } else {
    console.log('⚠️ PostgreSQL connection failed (Make sure your local PostgreSQL is running or DATABASE_URL in .env is correct).');
  }

  await closeDatabaseConnection();
}

main();
