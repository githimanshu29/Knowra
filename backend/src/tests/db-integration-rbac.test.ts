// Vitest test runner lifecycle hooks and assertions
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Drizzle comparison and sql operators
import { and, eq, sql } from 'drizzle-orm';
// Main database client instance
import { db } from '../db/index.js';
// Database schema table definitions
import {
  chunks,
  conversations,
  documentPermissions,
  documents,
  documentVersions,
  messages,
  roles,
  tenants,
  userRoles,
  users,
} from '../db/schema/index.js';
// Hybrid search functions under test
import {
  executeLexicalBranch,
  executeVectorBranch,
} from '../services/retrieval/hybridSearch.js';

// TypeScript Concept: Vector Math Helper
// Generates a normalized 1536-dimensional vector for deterministic pgvector testing
// returns: number[]
function createDeterministicVector(seed: number): number[] {
  const dimension = 1536;
  const raw: number[] = new Array(dimension);
  let sumSq = 0;
  for (let i = 0; i < dimension; i++) {
    // Generate pseudorandom float using sine wave of index and seed
    const val = Math.sin(seed * 1000 + i);
    raw[i] = val;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < dimension; i++) {
    raw[i] = raw[i] / norm;
  }
  return raw;
}

describe('Real PostgreSQL Integration Suite (pgvector, RBAC ACL, Retrieval Metrics & Conversations)', () => {
  // Test fixture identifiers
  const tenantSlug = `test-corp-${Date.now()}`;
  let tenantId: string;
  let tenantBId: string;

  let adminRoleId: string;
  let engRoleId: string;
  let hrRoleId: string;

  let adminUserId: string;
  let engUserId: string;
  let hrUserId: string;
  let tenantBUserId: string;

  let publicDocId: string;
  let engDocId: string;
  let hrDocId: string;

  let publicChunkId: string;
  let engChunkId: string;
  let hrChunkId: string;

  let hrConversationId: string;
  let engConversationId: string;

  // Normalized embedding vectors for test chunks
  const publicVector = createDeterministicVector(1);
  const engVector = createDeterministicVector(2);
  const hrVector = createDeterministicVector(3);

  beforeAll(async () => {
    // 1. Create primary test tenant
    // tenantRes is an Array containing the created tenant row
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Enterprise Test Corp',
        slug: tenantSlug,
        isActive: true,
      })
      .returning();
    tenantId = tenant.id;

    // 2. Create second isolated tenant for cross-tenant testing
    const [tenantB] = await db
      .insert(tenants)
      .values({
        name: 'Isolated Competitor Corp',
        slug: `isolated-corp-${Date.now()}`,
        isActive: true,
      })
      .returning();
    tenantBId = tenantB.id;

    // 3. Create 3 distinct roles in primary tenant
    const [adminR] = await db
      .insert(roles)
      .values({ tenantId, name: 'ADMIN', description: 'System Administrator' })
      .returning();
    adminRoleId = adminR.id;

    const [engR] = await db
      .insert(roles)
      .values({ tenantId, name: 'ENGINEERING', description: 'Engineering Department' })
      .returning();
    engRoleId = engR.id;

    const [hrR] = await db
      .insert(roles)
      .values({ tenantId, name: 'HR', description: 'Human Resources Department' })
      .returning();
    hrRoleId = hrR.id;

    // 4. Create 3 distinct users in primary tenant
    const [adminU] = await db
      .insert(users)
      .values({
        tenantId,
        email: `admin-${Date.now()}@testcorp.com`,
        hashedPassword: 'hashed-password-stub',
        fullName: 'Admin User',
        isSuperuser: true,
      })
      .returning();
    adminUserId = adminU.id;

    const [engU] = await db
      .insert(users)
      .values({
        tenantId,
        email: `eng-${Date.now()}@testcorp.com`,
        hashedPassword: 'hashed-password-stub',
        fullName: 'Engineer User',
        isSuperuser: false,
      })
      .returning();
    engUserId = engU.id;

    const [hrU] = await db
      .insert(users)
      .values({
        tenantId,
        email: `hr-${Date.now()}@testcorp.com`,
        hashedPassword: 'hashed-password-stub',
        fullName: 'HR User',
        isSuperuser: false,
      })
      .returning();
    hrUserId = hrU.id;

    // User in Tenant B
    const [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantBId,
        email: `outsider-${Date.now()}@isolated.com`,
        hashedPassword: 'hashed-password-stub',
        fullName: 'Tenant B User',
        isSuperuser: false,
      })
      .returning();
    tenantBUserId = userB.id;

    // 5. Map users to respective roles
    await db.insert(userRoles).values([
      { userId: adminUserId, roleId: adminRoleId },
      { userId: engUserId, roleId: engRoleId },
      { userId: hrUserId, roleId: hrRoleId },
    ]);

    // 6. Create 3 documents with distinct access levels
    const [pubD] = await db
      .insert(documents)
      .values({
        tenantId,
        createdBy: adminUserId,
        title: 'Company General Remote Work Policy',
        filename: 'remote-policy.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        contentHash: `hash-pub-${Date.now()}`,
        storagePath: 'storage/test-pub.pdf',
        isPublicWithinTenant: true,
        status: 'READY',
      })
      .returning();
    publicDocId = pubD.id;

    const [engD] = await db
      .insert(documents)
      .values({
        tenantId,
        createdBy: engUserId,
        title: 'Kubernetes Production Cluster Infrastructure',
        filename: 'k8s-infra.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
        contentHash: `hash-eng-${Date.now()}`,
        storagePath: 'storage/test-eng.pdf',
        isPublicWithinTenant: false,
        status: 'READY',
      })
      .returning();
    engDocId = engD.id;

    const [hrD] = await db
      .insert(documents)
      .values({
        tenantId,
        createdBy: hrUserId,
        title: 'Confidential Executive Payroll Packages',
        filename: 'payroll-confidential.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3072,
        contentHash: `hash-hr-${Date.now()}`,
        storagePath: 'storage/test-hr.pdf',
        isPublicWithinTenant: false,
        status: 'READY',
      })
      .returning();
    hrDocId = hrD.id;

    // 7. Grant RBAC document permissions
    await db.insert(documentPermissions).values([
      {
        documentId: engDocId,
        roleId: engRoleId,
        permissionLevel: 'read',
      },
      {
        documentId: hrDocId,
        roleId: hrRoleId,
        permissionLevel: 'read',
      },
    ]);

    // 8. Create versions for documents
    const [pubV] = await db
      .insert(documentVersions)
      .values({
        documentId: publicDocId,
        versionNumber: 1,
        contentHash: `hash-ver-pub-${Date.now()}`,
        summary: 'General remote work policy overview',
      })
      .returning();

    const [engV] = await db
      .insert(documentVersions)
      .values({
        documentId: engDocId,
        versionNumber: 1,
        contentHash: `hash-ver-eng-${Date.now()}`,
        summary: 'Engineering kubernetes architecture overview',
      })
      .returning();

    const [hrV] = await db
      .insert(documentVersions)
      .values({
        documentId: hrDocId,
        versionNumber: 1,
        contentHash: `hash-ver-hr-${Date.now()}`,
        summary: 'HR compensation and bonus overview',
      })
      .returning();

    // 9. Insert chunks with real 1536 vectors and tsvector
    const [pubC] = await db
      .insert(chunks)
      .values({
        tenantId,
        documentId: publicDocId,
        versionId: pubV.id,
        chunkIndex: 0,
        content: 'Company general policy permits remote work up to 2 days per week for all employees.',
        tokenCount: 16,
        pageNumber: 1,
        sectionHeading: 'General Policy',
        headingPath: 'Handbook > Remote Policy',
        chunkStrategy: 'semantic',
        embedding: publicVector,
        searchVector: sql`to_tsvector('english', 'Company general policy permits remote work up to 2 days per week for all employees.')`,
      })
      .returning();
    publicChunkId = pubC.id;

    const [engC] = await db
      .insert(chunks)
      .values({
        tenantId,
        documentId: engDocId,
        versionId: engV.id,
        chunkIndex: 0,
        content: 'Kubernetes cluster production deployment uses Terraform modules and ArgoCD pipelines.',
        tokenCount: 12,
        pageNumber: 1,
        sectionHeading: 'Infrastructure',
        headingPath: 'Engineering > Kubernetes',
        chunkStrategy: 'semantic',
        embedding: engVector,
        searchVector: sql`to_tsvector('english', 'Kubernetes cluster production deployment uses Terraform modules and ArgoCD pipelines.')`,
      })
      .returning();
    engChunkId = engC.id;

    const [hrC] = await db
      .insert(chunks)
      .values({
        tenantId,
        documentId: hrDocId,
        versionId: hrV.id,
        chunkIndex: 0,
        content: 'Confidential executive payroll packages and quarterly bonus structure guidelines.',
        tokenCount: 10,
        pageNumber: 1,
        sectionHeading: 'Payroll',
        headingPath: 'HR > Executive Compensation',
        chunkStrategy: 'semantic',
        embedding: hrVector,
        searchVector: sql`to_tsvector('english', 'Confidential executive payroll packages and quarterly bonus structure guidelines.')`,
      })
      .returning();
    hrChunkId = hrC.id;

    // 10. Create conversations
    const [hrConv] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId: hrUserId,
        title: 'HR Executive Compensation Inquiry',
      })
      .returning();
    hrConversationId = hrConv.id;

    await db.insert(messages).values({
      conversationId: hrConversationId,
      role: 'user',
      content: 'What is the quarterly bonus formula?',
    });

    const [engConv] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId: engUserId,
        title: 'Kubernetes CI Pipeline Discussion',
      })
      .returning();
    engConversationId = engConv.id;

    await db.insert(messages).values({
      conversationId: engConversationId,
      role: 'user',
      content: 'How do we deploy ArgoCD pipelines?',
    });
  }, 60000);

  afterAll(async () => {
    // Cascade cleanup of test data
    try {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantBId));
    } catch (cleanupErr) {
      console.error('Test cleanup warning:', cleanupErr);
    }
  }, 60000);

  describe('Real Database Vector Branch ACL Enforcement', () => {
    it('should strictly restrict Engineer user from seeing HR documents in vector search', async () => {
      // Query with vector matching HR document
      const results = await executeVectorBranch(
        hrVector,
        tenantId,
        10,
        engUserId,
        [engRoleId],
        false
      );

      const returnedChunkIds = results.map((r) => r.id);
      // Zero ACL leakage assertion
      expect(returnedChunkIds).not.toContain(hrChunkId);
      // Engineer can still see public document
      expect(returnedChunkIds).toContain(publicChunkId);
    });

    it('should strictly restrict HR user from seeing Engineering documents in vector search', async () => {
      // Query with vector matching Engineering document
      const results = await executeVectorBranch(
        engVector,
        tenantId,
        10,
        hrUserId,
        [hrRoleId],
        false
      );

      const returnedChunkIds = results.map((r) => r.id);
      // Zero ACL leakage assertion
      expect(returnedChunkIds).not.toContain(engChunkId);
      // HR can still see public document
      expect(returnedChunkIds).toContain(publicChunkId);
    });

    it('should allow SuperAdmin to retrieve all documents across roles in vector search', async () => {
      const results = await executeVectorBranch(
        hrVector,
        tenantId,
        10,
        adminUserId,
        [adminRoleId],
        true
      );

      const returnedChunkIds = results.map((r) => r.id);
      expect(returnedChunkIds).toContain(hrChunkId);
      expect(returnedChunkIds).toContain(publicChunkId);
    });
  });

  describe('Real Database Lexical Branch ACL Enforcement', () => {
    it('should prevent keyword search leaks for unauthorized documents', async () => {
      // Clean query matches HR document keyword 'payroll'
      const results = await executeLexicalBranch(
        'payroll bonus',
        tenantId,
        10,
        engUserId,
        [engRoleId],
        false
      );

      const returnedChunkIds = results.map((r) => r.id);
      // Zero ACL leakage assertion
      expect(returnedChunkIds).not.toContain(hrChunkId);
      expect(results.length).toBe(0);
    });

    it('should permit authorized HR user to retrieve payroll document via lexical search', async () => {
      const results = await executeLexicalBranch(
        'payroll bonus',
        tenantId,
        10,
        hrUserId,
        [hrRoleId],
        false
      );

      const returnedChunkIds = results.map((r) => r.id);
      expect(returnedChunkIds).toContain(hrChunkId);
    });

    it('should permit any user within tenant to find public handbook document via lexical search', async () => {
      const results = await executeLexicalBranch(
        'remote work policy',
        tenantId,
        10,
        engUserId,
        [engRoleId],
        false
      );

      const returnedChunkIds = results.map((r) => r.id);
      expect(returnedChunkIds).toContain(publicChunkId);
    });
  });

  describe('Cross-Tenant Data Isolation in Real Database', () => {
    it('should return 0 results when user from Tenant B searches for Tenant A public documents', async () => {
      const results = await executeLexicalBranch(
        'remote work policy',
        tenantBId,
        10,
        tenantBUserId,
        [],
        false
      );

      expect(results.length).toBe(0);
    });

    it('should return 0 vector results across tenant boundaries', async () => {
      const results = await executeVectorBranch(
        publicVector,
        tenantBId,
        10,
        tenantBUserId,
        [],
        false
      );

      expect(results.length).toBe(0);
    });
  });

  describe('Retrieval Evaluation Metrics (Recall@k and MRR on Real DB)', () => {
    // TypeScript Concept: Retrieval Evaluation Metric Calculator
    // Computes Mean Reciprocal Rank (MRR) for candidate list
    // returns: number
    function calculateMRR(candidateIds: string[], targetId: string): number {
      const index = candidateIds.indexOf(targetId);
      if (index === -1) return 0;
      return 1 / (index + 1);
    }

    // TypeScript Concept: Recall at K Calculator
    // Computes binary recall at rank k
    // returns: number
    function calculateRecallAtK(candidateIds: string[], targetId: string, k: number): number {
      const topK = candidateIds.slice(0, k);
      return topK.includes(targetId) ? 1.0 : 0.0;
    }

    it('should achieve 1.0 Recall@1 and 1.0 MRR for Engineering query by Engineer', async () => {
      const candidates = await executeLexicalBranch(
        'Kubernetes cluster Terraform',
        tenantId,
        5,
        engUserId,
        [engRoleId],
        false
      );

      const candidateIds = candidates.map((c) => c.id);
      const recall1 = calculateRecallAtK(candidateIds, engChunkId, 1);
      const mrr = calculateMRR(candidateIds, engChunkId);

      expect(recall1).toBe(1.0);
      expect(mrr).toBe(1.0);
    });

    it('should achieve 1.0 Recall@1 and 1.0 MRR for HR query by HR user', async () => {
      const candidates = await executeLexicalBranch(
        'Confidential executive payroll',
        tenantId,
        5,
        hrUserId,
        [hrRoleId],
        false
      );

      const candidateIds = candidates.map((c) => c.id);
      const recall1 = calculateRecallAtK(candidateIds, hrChunkId, 1);
      const mrr = calculateMRR(candidateIds, hrChunkId);

      expect(recall1).toBe(1.0);
      expect(mrr).toBe(1.0);
    });

    it('should properly abstain (0 results) on out-of-domain unanswerable queries', async () => {
      const candidates = await executeLexicalBranch(
        'interstellar warp drive antigravity propulsion',
        tenantId,
        5,
        engUserId,
        [engRoleId],
        false
      );

      expect(candidates.length).toBe(0);
    });
  });

  describe('Conversation Ownership & Isolation Enforcement', () => {
    it('should allow owner to load their own conversation with messages', async () => {
      // owner query matching chatQueryHandler filter
      const conv = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, hrConversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, hrUserId)
        ),
      });

      expect(conv).toBeDefined();
      expect(conv?.title).toBe('HR Executive Compensation Inquiry');
    });

    it('should reject another tenant user from accessing someone elses conversation (404 isolation)', async () => {
      // Engineer attempts to access HR user conversation
      const conv = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, hrConversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, engUserId)
        ),
      });

      // Assert that another user in the same tenant cannot load the conversation
      expect(conv).toBeUndefined();
    });

    it('should prevent cross-tenant conversation access entirely', async () => {
      const conv = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, hrConversationId),
          eq(conversations.tenantId, tenantBId)
        ),
      });

      expect(conv).toBeUndefined();
    });
  });
});
