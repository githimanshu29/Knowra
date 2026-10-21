// Password hashing and verification library
import bcrypt from 'bcryptjs';
// JSON Web Token signing and decoding library
import jwt from 'jsonwebtoken';
// Validated secret keys and token expiry from environment config
import { env } from '../config/env.js';

// Salt rounds constant for bcrypt computational cost
const SALT_ROUNDS = 10;

// TypeScript interface defines the exact shape of data stored inside the JWT token
export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
}

// hashes plain password using bcrypt salt
// returns: Promise<string> containing 60 character bcrypt hash string
export async function hashPassword(plainPassword: string): Promise<string> {
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// compares candidate plain password against stored hash
// returns: Promise<boolean> true if password matches false otherwise
export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, passwordHash);
}

// signs and creates a new JWT access token
// returns: string containing signed JWT bearer token
export function generateAccessToken(payload: AuthTokenPayload): string {
  // Sign token using secret key and expiry from env
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

// verifies and decodes incoming JWT token
// returns: AuthTokenPayload object if token is valid or null if token is expired or forged
export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    // TypeScript type assertion: tells compiler decoded object matches AuthTokenPayload interface
    return decoded as AuthTokenPayload;
  } catch (error) {
    return null;
  }
}
