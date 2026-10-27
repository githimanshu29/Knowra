// Zod library for validating document management payloads
import { z } from 'zod';

// Schema for updating document visibility within tenant
export const updateDocumentAccessSchema = z.object({
  isPublicWithinTenant: z.boolean(),
});

// Schema for granting document permissions to a role or user
export const addDocumentPermissionSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    permissionLevel: z.enum(['read', 'write', 'admin']).default('read'),
  })
  .refine((data) => data.roleId !== undefined || data.userId !== undefined, {
    message: 'Either roleId or userId must be specified to grant permission',
    path: ['roleId'],
  });

// Inferred TypeScript types
export type UpdateDocumentAccessInput = z.infer<typeof updateDocumentAccessSchema>;
export type AddDocumentPermissionInput = z.infer<typeof addDocumentPermissionSchema>;
