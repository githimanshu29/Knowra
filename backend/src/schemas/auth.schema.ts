// Zod library for runtime data validation and typescript type inference
import { z } from 'zod';

// Zod schema for creating a new tenant organization and initial admin account
export const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(100),
  tenantSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  adminFullName: z.string().min(2).max(100),
});

// Zod schema for user login payload
export const loginSchema = z.object({
  tenantSlug: z.string().min(1, 'Tenant slug is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// TypeScript Concept: z.infer
// In typescript writing both a zod validator and an interface duplicates code
// z.infer automatically extracts the static typescript type directly from the zod schema
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
