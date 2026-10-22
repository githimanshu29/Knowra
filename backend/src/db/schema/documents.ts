// Drizzle postgres column types and table helper
import { boolean, customType, index, integer, pgTable, text, timestamp, unique, uuid, varchar, vector } from 'drizzle-orm/pg-core';
// Drizzle relations helper for connecting tables in queries
import { relations } from 'drizzle-orm';
// Foreign key reference targets from auth schema
import { roles, tenants, users } from './auth.js';

// customType bridges postgres native full-text tsvector column with javascript string
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

// 1. Documents Table
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 500 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  isPublicWithinTenant: boolean('is_public_within_tenant').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Document Versions Table
export const documentVersions = pgTable('document_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  versionNumber: integer('version_number').default(1).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('uq_doc_version').on(table.documentId, table.versionNumber),
]);

// 3. Document Permissions Table
export const documentPermissions = pgTable('document_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  permissionLevel: varchar('permission_level', { length: 50 }).default('read').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Chunks Table with Vector and Full-Text Search Columns
export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: uuid('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  versionId: uuid('version_id')
    .references(() => documentVersions.id, { onDelete: 'cascade' })
    .notNull(),
  parentChunkId: uuid('parent_chunk_id'),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').default(0).notNull(),
  pageNumber: integer('page_number'),
  sectionHeading: varchar('section_heading', { length: 500 }),
  headingPath: varchar('heading_path', { length: 1000 }),
  chunkStrategy: varchar('chunk_strategy', { length: 50 }).default('semantic').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  searchVector: tsvector('search_vector'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_chunks_search_vector').using('gin', table.searchVector),
]);

// 5. Ingestion Jobs Table
export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: uuid('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  status: varchar('status', { length: 50 }).default('QUEUED').notNull(),
  progressPercent: integer('progress_percent').default(0).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Drizzle Relations between tables for relational API joins
export const documentsRelations = relations(documents, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [documents.tenantId],
    references: [tenants.id],
  }),
  createdByUser: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
  }),
  versions: many(documentVersions),
  permissions: many(documentPermissions),
  chunks: many(chunks),
  ingestionJobs: many(ingestionJobs),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
  chunks: many(chunks),
}));

export const documentPermissionsRelations = relations(documentPermissions, ({ one }) => ({
  document: one(documents, {
    fields: [documentPermissions.documentId],
    references: [documents.id],
  }),
  role: one(roles, {
    fields: [documentPermissions.roleId],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [documentPermissions.userId],
    references: [users.id],
  }),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [chunks.tenantId],
    references: [tenants.id],
  }),
  document: one(documents, {
    fields: [chunks.documentId],
    references: [documents.id],
  }),
  version: one(documentVersions, {
    fields: [chunks.versionId],
    references: [documentVersions.id],
  }),
  parentChunk: one(chunks, {
    fields: [chunks.parentChunkId],
    references: [chunks.id],
  }),
}));

export const ingestionJobsRelations = relations(ingestionJobs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [ingestionJobs.tenantId],
    references: [tenants.id],
  }),
  document: one(documents, {
    fields: [ingestionJobs.documentId],
    references: [documents.id],
  }),
}));

// TypeScript Type Inference Concept:
// $inferSelect extracts the typescript object shape returned when querying a row from the database
export type Document = typeof documents.$inferSelect;
// $inferInsert extracts the typescript object shape accepted when inserting a new row
export type NewDocument = typeof documents.$inferInsert;

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;

export type DocumentPermission = typeof documentPermissions.$inferSelect;
export type NewDocumentPermission = typeof documentPermissions.$inferInsert;

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
