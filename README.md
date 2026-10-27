# Knowra — Enterprise Knowledge Intelligence Platform

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-Cosine_Distance-blue?style=for-the-badge)](https://github.com/pgvector/pgvector)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-Type_Safe-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-42_Tests_Passed-green?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)

**Knowra** is a production-grade Enterprise Knowledge Intelligence Platform and Advanced RAG (Retrieval-Augmented Generation) system built with Node.js, Express 5, TypeScript, Drizzle ORM, and PostgreSQL with pgvector. It is engineered for enterprises requiring secure, verifiable, evidence-grounded answers from internal documents (PDFs, Word DOCX, technical specs, compliance reports, and CSV tables) with strict multi-tenant isolation, role-based access control, and defensible grounding verification.

---

## 🌟 Core Architectural Pillars

### 1. Multi-Tenancy & Hard Isolation
- Every enterprise organization is mapped to a unique `tenant_id` (UUID).
- Cross-tenant data leakage is structurally blocked: every database query, vector similarity scan, and conversation lookup is strictly scoped by `WHERE tenant_id = :authenticatedTenantId`.
- Verified with real database tests: a user from Tenant B cannot retrieve Tenant A documents, even for documents marked public within Tenant A.

### 2. Document-Level Access Control (RBAC)
- Multi-layer authorization enforced in SQL before retrieved chunks reach the LLM:
  - Documents can be public within a tenant (`is_public_within_tenant = true`).
  - Restricted documents require explicit ownership (`created_by = userId`) or role grants (`document_permissions.role_id IN (:userRoleIds)`).
  - SuperAdmin override flag (`isSuperAdmin`) enables organizational auditing.
- Document permission endpoints (`POST /api/v1/documents/:id/permissions`, `DELETE /api/v1/documents/:id/permissions/:permId`, `PATCH /api/v1/documents/:id/access-level`) validate cross-tenant boundaries with Zod schemas to prevent cross-tenant permission poisoning.

### 3. Structure-Preserving Semantic Ingestion & Durable Pipeline
- **Heading Breadcrumbs**: Chunks inherit their parent heading hierarchy (e.g., `Handbook > Section 4: Leaves > Vacation Policy`), eliminating topic drift in embeddings.
- **Table Preservation**: Table rows are parsed as structured semantic units (`Column Header: Cell Value`), preventing table shredding.
- **SHA-256 Deduplication**: Content hashing prevents redundant uploads and vector indexing, and deduplication responses respect ACL boundaries.
- **Tiktoken BPE Tokenization**: Exact BPE token counting with `tiktoken` (`cl100k_base`).
- **Durable Worker with Backoff Retries**: Ingestion jobs track `retryCount` and `maxRetries` with exponential backoff (2s, 4s, 8s up to 30s) on transient errors.
- **Crash Recovery**: Server restarts trigger `recoverStuckIngestionJobs()`, resuming interrupted jobs rather than abandoning them.

### 4. Hybrid Retrieval (Vector + Lexical) & Reranking
- **Dense Vector Search**: Native PostgreSQL `pgvector` HNSW index with cosine distance (`<=>`), querying 1536-dimensional OpenAI embeddings (`text-embedding-3-small`).
- **Sparse Lexical Search**: Native PostgreSQL full-text search (`tsvector` with GIN indexing) combining `websearch_to_tsquery` and prefix matching (`:*`) for technical acronyms, model numbers, and IDs.
- **Reciprocal Rank Fusion (RRF)**: Merges dense and sparse candidate pools with constant $k=60$ to avoid score distribution bias.
- **Parent Context Swapping**: Matches against concise 200-token child chunks and expands to full 800-token parent context blocks before prompting the LLM.
- **Honest Reranking**: By default, uses deterministic lexical-semantic alignment and BM25-style frequency scoring. If a `COHERE_API_KEY` is provided, automatically uses Cohere's neural cross-encoder.

### 5. Multi-Turn Conversation Persistence with Per-User Isolation
- Full multi-turn conversation support with `conversations` and `messages` tables.
- **Strict Ownership Check**: `chatQueryHandler` enforces `userId = req.user.userId` alongside `tenantId`, preventing other tenant users with known conversation IDs from snooping on history or appending messages.

### 6. Security Hardening & Multilingual Guardrails
- **HTTP Hardening**: Helmet security headers, CORS allowlist, rate limiting (auth, general, chat), `trust proxy` enabled for reverse proxies.
- **Upstream Error Redaction**: Provider error details from OpenAI/Cohere are logged internally and sanitized for clients.
- **Multilingual Prompt Injection Detection**: Rejects English and Hindi/Hinglish jailbreak attempts and system prompt overrides (`ignore previous instructions`, `dan mode`, `sab bhul jao`).
- **Global & Indian PII Redaction**: Automatically redacts credit cards, SSNs, OpenAI keys, Indian Aadhaar numbers, Indian PAN cards, and Indian phone numbers.
- **Evidence Contact Preservation**: Retrieved evidence preserves official corporate emails and phone numbers so HR/support queries remain answerable while personal identifiers stay protected.

### 7. Grounding Verification & Streaming Warnings
- **Exact Token Boundary Matching**: Verifies numeric claims using exact token sets, preventing false substring matches (e.g., "5" inside "15" or "50").
- **Lexical Overlap Score**: Computes sentence-level token overlap against cited source chunks.
- **Streaming Grounding Markers**: When streaming SSE responses, verification metadata (`isGrounded`, `groundingScore`, `groundingWarning`) is emitted with the `citations` event to flag ungrounded content directly in the UI.

---

## 🏗️ System Architecture Flow

```text
[ React Frontend / API Client ]
       │
       ▼ POST /api/v1/chat/query (Bearer JWT)
[ Express API Gateway ]
       │  • Helmet + Rate Limiter + CORS Allowlist
       │  • Authenticate (Extracts tenantId, userId, roleIds, isSuperAdmin)
       │  • Input Guardrails (Injection check + PII redaction)
       │  • Conversation Ownership Check (Enforces user isolation)
       ▼
[ LangGraph Stateful RAG Workflow ]
       │
       ├── 1. Context Compression & Retrieval Node
       │      ├── pgvector HNSW Cosine Search (<=>)
       │      ├── tsvector GIN Full-Text Search (websearch_to_tsquery + OR)
       │      │   (Both queries strictly filtered by tenantId & user roles)
       │      ├── Reciprocal Rank Fusion (RRF k=60)
       │      ├── Lexical Alignment Reranker (or Cohere if configured)
       │      └── Parent Context Swap (200t child -> 800t parent)
       │
       ├── 2. Grounded Generation Node (OpenAI Streaming)
       │      ├── Evidence context with [Evidence X] markers
       │      ├── Strict system grounding instructions
       │      └── Real-time token streaming via Server-Sent Events (SSE)
       │
       └── 3. Claim Grounding Verification Node
              ├── Strips citation tags and verifies exact numeric claims
              ├── Sentence-to-chunk lexical token overlap check
              └── Emits groundingScore and groundingWarning in citations event
       │
       ▼ SSE Stream / JSON Response with Citations & Grounding Metrics
[ Client Displays Verified Answer + Source Citations ]
```

---

## 📂 Repository Layout

```text
Knowra/
├── backend/
│   ├── src/
│   │   ├── config/              # Zod-validated environment configuration (env.ts)
│   │   ├── controllers/         # Auth, Document, and Chat controllers
│   │   ├── db/                  # PostgreSQL connection pool & Drizzle ORM client
│   │   │   ├── schema/          # Relational tables (auth, documents, chat)
│   │   │   └── migrate-schema.ts # Automated DDL migration script
│   │   ├── graph/               # LangGraph stateful RAG workflow
│   │   │   ├── nodes/           # Generation, retrieval, citation verification
│   │   │   ├── state.ts         # Agent state definitions
│   │   │   └── workflow.ts      # Compiled LangGraph pipeline
│   │   ├── middleware/          # JWT auth, upload filter, rate limiters, error handler
│   │   ├── routes/              # Express API routers (/auth, /documents, /chat)
│   │   ├── schemas/             # Zod request validation schemas
│   │   ├── services/
│   │   │   ├── ingestion/       # Semantic parsers, BPE chunker, embedder, durable worker
│   │   │   ├── retrieval/       # Hybrid search, reranker, parent swap
│   │   │   ├── security/        # Multilingual guardrails & PII redaction
│   │   │   └── storage.service.ts # SHA-256 deduplicated disk storage
│   │   ├── tests/               # Vitest test suite (42 tests across 6 files)
│   │   │   ├── db-integration-rbac.test.ts # Real PostgreSQL pgvector integration tests
│   │   │   ├── citation.test.ts # Grounding & citation tests
│   │   │   ├── rag-evaluation.test.ts # Retrieval metrics & triad evaluation
│   │   │   ├── rbac.test.ts     # RBAC unit tests
│   │   │   ├── security.test.ts # Guardrails, PII & magic bytes tests
│   │   │   └── tokenizer.test.ts # Tiktoken BPE tokenizer tests
│   │   └── server.ts            # Server bootstrap, trust proxy, startup recovery
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts         # Vitest test runner configuration
├── explain/                     # Visual architecture and schema guides
└── problems/                    # Problem breakdowns and engineering decisions
```

---

## 🧪 Comprehensive Test Suite (42 Passed)

Knowra includes comprehensive automated testing covering both unit logic and real database execution against live PostgreSQL with pgvector:

| Test File | Tests | Coverage Scope |
|:---|:---:|:---|
| `db-integration-rbac.test.ts` | 14 | Real PostgreSQL queries, vector branch ACL, lexical branch ACL, SuperAdmin override, cross-tenant isolation, Recall@1, MRR, unanswerable query abstention, conversation ownership isolation |
| `citation.test.ts` | 4 | Exact numeric claim matching (preventing false "5" vs "15" matches), word overlap grounding, ungrounded claim flagging |
| `rag-evaluation.test.ts` | 6 | RAG triad metrics, context precision, context recall, faithfulness, answer relevancy, abstention |
| `security.test.ts` | 10 | PDF/DOCX magic bytes validation, injection detection (English + Hindi), Indian PII redaction (Aadhaar, PAN, phone), contact preservation |
| `rbac.test.ts` | 5 | JWT role claims, access level permission evaluation, superAdmin privileges |
| `tokenizer.test.ts` | 3 | Tiktoken `cl100k_base` BPE token estimation for text and code |

### Running the Test Suite
```bash
cd backend
npm test
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v15+ with the `pgvector` extension enabled (e.g., Neon Cloud or local PostgreSQL)
- **OpenAI API Key**: Required for embeddings and answer generation

### 1. Installation
```bash
git clone https://github.com/githimanshu29/Knowra.git
cd Knowra/backend
npm install
```

### 2. Configure Environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```

Set the required variables:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host:5432/knowra_db?sslmode=require
JWT_SECRET=your_super_secret_key_at_least_32_characters_long
OPENAI_API_KEY=sk-proj-...
# Optional: COHERE_API_KEY for neural cross-encoder reranking
```

### 3. Run Database Migrations
```bash
npm run build
npx tsx src/db/migrate-schema.ts
```

### 4. Start the Application
```bash
# Development mode with hot-reload
npm run dev

# Production build and run
npm run build
npm start
```

### 5. Health Check
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "knowra-backend",
  "environment": "development",
  "timestamp": "2026-10-27T13:30:00.000Z",
  "database": true,
  "uptimeSeconds": 12
}
```

---

## 🛡️ API Endpoints Summary

### Authentication (`/api/v1/auth`)
- `POST /register-tenant`: Creates tenant, default roles, and superuser.
- `POST /login`: Authenticates credentials and issues signed JWT with `tenantId`, `userId`, `roleIds`, and `isSuperAdmin`.

### Documents (`/api/v1/documents`)
- `POST /upload`: Uploads and queues document with SHA-256 deduplication.
- `GET /`: Lists accessible documents within tenant.
- `GET /:id`: Retrieves document details.
- `DELETE /:id`: Deletes document and associated chunks (owner or admin only).
- `PATCH /:id/access-level`: Updates tenant publicity (`isPublicWithinTenant`).
- `POST /:id/permissions`: Grants role or user permission (cross-tenant validated).
- `DELETE /:id/permissions/:permissionId`: Revokes document permission.

### Chat & Retrieval (`/api/v1/chat`)
- `POST /query`: Asynchronous or SSE streaming RAG query with citations and grounding scores.
- `GET /conversations`: Lists conversations owned by the authenticated user.
- `GET /conversations/:id`: Loads conversation history with messages and citations (isolated per user).
- `DELETE /conversations/:id`: Deletes conversation (owner only).

---

## 📄 License
This project is licensed under the ISC License.
