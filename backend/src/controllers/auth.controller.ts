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

    // existingTenant is a single object or undefined
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
      const [newTenant] = await tx
        .insert(tenants)
        .values({
          name: input.tenantName,
          slug: input.tenantSlug,
        })
        .returning();

      const [adminRole] = await tx
        .insert(roles)
        .values({
          tenantId: newTenant.id,
          name: 'ADMIN',
          description: 'Tenant Administrator with full access',
        })
        .returning();

      const hashedPassword = await hashPassword(input.adminPassword);

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
        roleIds: [adminRole.id],
        isSuperAdmin: true,
      });

      return {
        token,
        user: {
          id: newUser.id,
          tenantId: newTenant.id,
          email: newUser.email,
          fullName: newUser.fullName,
          roles: ['ADMIN'],
          roleIds: [adminRole.id],
          isSuperAdmin: true,
        },
      };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Authenticates user within tenant and returns signed JWT with role UUIDs and names
// returns: Promise<void> responds with 200 json { token: string, user: object }
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);

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

    const roleNames = userWithRoles.userRoles.map((ur) => ur.role.name);
    const roleIds = userWithRoles.userRoles.map((ur) => ur.role.id);
    const isSuperAdmin =
      userWithRoles.isSuperuser ||
      roleNames.some((r) => r.toUpperCase() === 'ADMIN' || r.toUpperCase() === 'SUPER_ADMIN');

    const token = generateAccessToken({
      userId: userWithRoles.id,
      tenantId: tenant.id,
      email: userWithRoles.email,
      roles: roleNames,
      roleIds: roleIds,
      isSuperAdmin,
    });

    res.status(200).json({
      token,
      user: {
        id: userWithRoles.id,
        tenantId: tenant.id,
        email: userWithRoles.email,
        fullName: userWithRoles.fullName,
        roles: roleNames,
        roleIds: roleIds,
        isSuperAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Creates a new non-admin or role-specific user within the authenticated tenant
// returns: Promise<void> responds with 201 json { user: object }
export async function createUserInTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, fullName, roleName } = req.body;
    const tenantId = req.user!.tenantId;

    if (!email || !password || !fullName || !roleName) {
      res.status(400).json({ error: 'Bad Request', message: 'Missing email, password, fullName, or roleName' });
      return;
    }

    const existingUser = await db.query.users.findFirst({
      where: and(eq(users.tenantId, tenantId), eq(users.email, email)),
    });

    if (existingUser) {
      res.status(409).json({ error: 'Conflict', message: 'User with this email already exists in this tenant' });
      return;
    }

    // Find or create role in tenant
    let targetRole = await db.query.roles.findFirst({
      where: and(eq(roles.tenantId, tenantId), eq(roles.name, roleName.toUpperCase())),
    });

    if (!targetRole) {
      const [newRole] = await db
        .insert(roles)
        .values({
          tenantId,
          name: roleName.toUpperCase(),
          description: `Custom tenant role: ${roleName}`,
        })
        .returning();
      targetRole = newRole;
    }

    const hashedPassword = await hashPassword(password);

    const createdUser = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId,
          email,
          hashedPassword,
          fullName,
          isSuperuser: false,
        })
        .returning();

      await tx.insert(userRoles).values({
        userId: newUser.id,
        roleId: targetRole!.id,
      });

      return {
        id: newUser.id,
        tenantId,
        email: newUser.email,
        fullName: newUser.fullName,
        roles: [targetRole!.name],
        roleIds: [targetRole!.id],
      };
    });

    res.status(201).json({ user: createdUser });
  } catch (error) {
    next(error);
  }
}

// Lists all RBAC roles configured for the authenticated tenant
// returns: Promise<void> responds with 200 json { roles: Array<Role> }
export async function listTenantRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const tenantRoles = await db.query.roles.findMany({
      where: eq(roles.tenantId, tenantId),
    });

    res.status(200).json({ roles: tenantRoles });
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
