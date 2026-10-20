// Drizzle ORM PostgreSQL table definitions aur column data types
import { boolean, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
// Drizzle relations helper ORM-level joins aur type-safe navigation ke liye
import { relations } from 'drizzle-orm';

// =========================================================================
// 1. TENANTS TABLE (ROOT OF MULTI-TENANCY)
// =========================================================================
/**
 * Tenants Table: Multi-tenant SaaS boundary.
 * 
 * Relational ID Architecture:
 * - `id` (UUID): Har enterprise/organization ka root unique identifier.
 * - Multi-Tenancy Rule: Database me sabhi users, documents, chunks isi `tenant_id` se tag hote hain.
 * - Zero Leakage: Koi bhi API query bina `WHERE tenant_id = :authenticatedTenantId` ke execute nahi hoti.
 * 
 * Sample DB Record:
 * {
 *   id: "e7b0a70f-90b5-4a61-8409-7815cf134261",
 *   name: "Acme Global Corp",
 *   slug: "acme-global",
 *   isActive: true,
 *   createdAt: "2026-10-20T18:00:00.000Z",
 *   updatedAt: "2026-10-20T18:00:00.000Z"
 * }
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(), // URL-friendly company slug
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// =========================================================================
// 2. USERS TABLE
// =========================================================================
/**
 * Users Table: Tenant-specific user accounts.
 * 
 * Relational ID Architecture:
 * - `id` (UUID): User ka unique primary key. Login ke baad JWT access token ke `sub` claim me store hota hai.
 * - `tenant_id` (UUID FK): Points to `tenants.id`. Indicates user's organization boundary.
 * - Unique Constraint: `(tenant_id, email)` composite unique hota hai. Matlab same email different tenants me
 *   exist kar sakta hai, par ek hi tenant ke andar duplicate email allow nahi hoga.
 * 
 * Sample DB Record:
 * {
 *   id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
 *   tenantId: "e7b0a70f-90b5-4a61-8409-7815cf134261",
 *   email: "engineer@acme.com",
 *   fullName: "Arjun Sharma",
 *   isActive: true,
 *   isSuperuser: false
 * }
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  hashedPassword: varchar('hashed_password', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isSuperuser: boolean('is_superuser').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_tenant_user_email').on(table.tenantId, table.email),
]);

// =========================================================================
// 3. ROLES TABLE (RBAC)
// =========================================================================
/**
 * Roles Table: Role-Based Access Control definition.
 * 
 * Relational ID Architecture:
 * - `id` (UUID): Role unique identifier (e.g. 'ADMIN', 'HR_MANAGER', 'LEGAL', 'ENGINEERING').
 * - `tenant_id` (UUID FK): Har tenant apne custom roles bana sakta hai (isolation).
 */
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_tenant_role_name').on(table.tenantId, table.name),
]);

// =========================================================================
// 4. USER_ROLES TABLE (MANY-TO-MANY MAPPING)
// =========================================================================
/**
 * UserRoles Mapping Table:
 * 
 * Relational ID Architecture:
 * - `user_id` (UUID FK): Points to `users.id`.
 * - `role_id` (UUID FK): Points to `roles.id`.
 * - Retrieval ACL Check: Jab query execute hoti hai, user ke assigned `role_id`s ko collect karke
 *   document permission table se verify kiya jata hai:
 *   WHERE doc.is_public = true OR doc_permission.role_id IN (user_role_ids)
 */
export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_user_role').on(table.userId, table.roleId),
]);

// =========================================================================
// DRIZZLE RELATIONS (TYPE-SAFE ORM NAVIGATION)
// =========================================================================

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  roles: many(roles),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [roles.tenantId],
    references: [tenants.id],
  }),
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

// =========================================================================
// INFERRED TYPESCRIPT TYPES
// =========================================================================
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
