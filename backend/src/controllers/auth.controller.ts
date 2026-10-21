// Express http request response and next function types
import { NextFunction, Request, Response } from 'express';
// Drizzle query equality and boolean logic operators
import { and, eq } from 'drizzle-orm';
// Database client instance for queries and transactions
import { db } from '../db/index.js';
// Drizzle table schemas
import { roles, tenants, userRoles, users } from '../db/schema/index.js';
// Security helpers for password hashing and jwt creation
import { comparePassword, generateAccessToken, hashPassword } from '../utils/security.js';
// Zod schemas for input validation
import { loginSchema, registerTenantSchema } from '../schemas/auth.schema.js';

// Registers a new tenant company and creates the initial admin user account
// returns: Promise<void> responds with 201 json { token: string, user: object }
export async function registerTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = registerTenantSchema.parse(req.body);

    // existingTenant is a single object { id: string, name: string, slug: string } or undefined
    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, input.tenantSlug),
    });

    if (existingTenant) {
      res.status(409).json({
        error: 'Conflict',
        message: 'A tenant with this slug already exists',
      });
      return;
    }

    // Database transaction guarantees all records are created together or all rolled back
    const result = await db.transaction(async (tx) => {
      // newTenant is a single object { id: string, name: string, slug: string, isActive: boolean, ... }
      const [newTenant] = await tx
        .insert(tenants)
        .values({
          name: input.tenantName,
          slug: input.tenantSlug,
        })
        .returning();

      // adminRole is a single object { id: string, tenantId: string, name: string, ... }
      const [adminRole] = await tx
        .insert(roles)
        .values({
          tenantId: newTenant.id,
          name: 'ADMIN',
          description: 'Tenant Administrator with full access',
        })
        .returning();

      const hashedPassword = await hashPassword(input.adminPassword);

      // newUser is a single object { id: string, tenantId: string, email: string, fullName: string, ... }
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId: newTenant.id,
          email: input.adminEmail,
          hashedPassword,
          fullName: input.adminFullName,
          isSuperuser: false,
        })
        .returning();

      // Link newly created user to the admin role
      await tx.insert(userRoles).values({
        userId: newUser.id,
        roleId: adminRole.id,
      });

      const token = generateAccessToken({
        userId: newUser.id,
        tenantId: newTenant.id,
        email: newUser.email,
        roles: ['ADMIN'],
      });

      return {
        token,
        user: {
          id: newUser.id,
          tenantId: newTenant.id,
          email: newUser.email,
          fullName: newUser.fullName,
          roles: ['ADMIN'],
        },
      };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Authenticates user within tenant and returns signed JWT
// returns: Promise<void> responds with 200 json { token: string, user: object }
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);

    // tenant is a single object { id: string, name: string, slug: string } or undefined
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, input.tenantSlug),
    });

    if (!tenant || !tenant.isActive) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid tenant, email, or password',
      });
      return;
    }

    // userWithRoles is a single object with nested userRoles array or undefined
    const userWithRoles = await db.query.users.findFirst({
      where: and(eq(users.tenantId, tenant.id), eq(users.email, input.email)),
      with: {
        userRoles: {
          with: {
            role: true,
          },
        },
      },
    });

    if (!userWithRoles || !userWithRoles.isActive) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid tenant, email, or password',
      });
      return;
    }

    const isPasswordValid = await comparePassword(input.password, userWithRoles.hashedPassword);

    if (!isPasswordValid) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid tenant, email, or password',
      });
      return;
    }

    // rolesList is an Array of strings: ['ADMIN', 'HR_MANAGER']
    const rolesList = userWithRoles.userRoles.map((ur) => ur.role.name);

    const token = generateAccessToken({
      userId: userWithRoles.id,
      tenantId: tenant.id,
      email: userWithRoles.email,
      roles: rolesList,
    });

    res.status(200).json({
      token,
      user: {
        id: userWithRoles.id,
        tenantId: tenant.id,
        email: userWithRoles.email,
        fullName: userWithRoles.fullName,
        roles: rolesList,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Returns authenticated user context attached by auth middleware
// returns: void responds with 200 json { user: AuthTokenPayload }
export function getCurrentUser(req: Request, res: Response): void {
  res.status(200).json({
    user: req.user,
  });
}
