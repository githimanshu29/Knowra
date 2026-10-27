// Password hashing and verification library
import bcrypt from 'bcryptjs';
// JSON Web Token signing and decoding library
import jwt from 'jsonwebtoken';
// Validated secret keys and token expiry from environment config
import { env } from '../config/env.js';

// Salt rounds constant for bcrypt computational cost
const SALT_ROUNDS = 10;

// TypeScript Concept: Interface
// Encapsulates user identity, tenant boundary, and RBAC permissions in JWT
export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  roleIds: string[];
  isSuperAdmin?: boolean;
}

// Hashes plain password using bcrypt salt
// returns: Promise<string> containing 60 character bcrypt hash string
export async function hashPassword(plainPassword: string): Promise<string> {
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// Compares candidate plain password against stored hash
// returns: Promise<boolean> true if password matches false otherwise
export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, passwordHash);
}

// Signs and creates a new JWT access token with pinned algorithm, issuer, and audience
// returns: string containing signed JWT bearer token
export function generateAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: 'knowra-auth',
    audience: 'knowra-api',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

// Verifies and decodes incoming JWT token with strict signature and claims validation
// returns: AuthTokenPayload | null
export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'knowra-auth',
      audience: 'knowra-api',
    });
    return decoded as AuthTokenPayload;
  } catch {
    return null;
  }
}
