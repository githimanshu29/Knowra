// Test script to verify password hashing and JWT token generation
import { comparePassword, generateAccessToken, hashPassword, verifyAccessToken } from '../utils/security.js';

async function main() {
  console.log('Testing Password Hashing and JWT...');

  const plainPassword = 'superSecretPassword123';
  const hash = await hashPassword(plainPassword);
  console.log('1. Generated Hash:', hash.substring(0, 25) + '...');

  const isMatch = await comparePassword(plainPassword, hash);
  console.log('2. Password Match Verification:', isMatch ? 'PASSED' : 'FAILED');

  const payload = {
    userId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    tenantId: 'e7b0a70f-90b5-4a61-8409-7815cf134261',
    email: 'arjun@acme.com',
    roles: ['HR_MANAGER', 'EMPLOYEE'],
  };

  const token = generateAccessToken(payload);
  console.log('3. Generated JWT Token:', token.substring(0, 30) + '...');

  const decoded = verifyAccessToken(token);
  console.log('4. Decoded Token User ID:', decoded?.userId);
  console.log('5. Decoded Token Tenant ID:', decoded?.tenantId);
  console.log('6. Decoded Token Roles:', decoded?.roles);
}

main();
