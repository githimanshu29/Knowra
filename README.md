# Knowra — Enterprise Knowledge Intelligence Platform

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-Cosine_Distance-blue?style=for-the-badge)](https://github.com/pgvector/pgvector)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-Type_Safe-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)

**Knowra** is a production-grade Enterprise Knowledge Intelligence Platform and Advanced RAG (Retrieval-Augmented Generation) system. It is engineered for organisations that require secure, verifiable, evidence-grounded answers from internal documents (PDFs, Word DOCX, technical specs, compliance reports, and CSV tables) without hallucinations or data leakage.

---

## 🌟 Core Architectural Pillars

### 1. Multi-Tenancy & Hard Isolation
- Every enterprise organization is mapped to a unique `tenant_id` (UUID).
- Cross-tenant data leakage is structurally blocked: every database query, vector similarity scan, and cache check is strictly scoped by `WHERE tenant_id = :authenticatedTenantId`.

### 2. Document-Level Access Control (RBAC)
- Role-based access control (RBAC) enforced on the backend *before* retrieved chunks reach the LLM.
- Users only retrieve information from documents they have explicit authorization to view.

### 3. Structure-Preserving Semantic Ingestion
- **Heading Propagation**: Every chunk inherits its parent heading path (e.g. `Handbook > Section 4: Leaves > Maternity`), preventing topic drift in vector embeddings.
- **Table Preservation**: Table rows are parsed as self-contained semantic records (`Column Header: Cell Value`), ensuring structured tables are never shredded or detached from context.
- **Deduplication**: SHA-256 content hashing eliminates duplicate uploads and prevents redundant vector indexing.
- **Multi-Format Support**: Native page-aware PDF parser (`pdf-parse`), structural DOCX parser (`mammoth`), CSV parser, and Markdown/TXT parsers.

### 4. Hybrid Retrieval (Vector + Lexical) & Reranking
- **Semantic Vector Search**: Native PostgreSQL `pgvector` dense vector search using Cosine Distance (`<=>`).
- **Lexical Keyword Search**: Native PostgreSQL full-text search (`tsvector` and `tsquery`) with GIN indexing for exact identifiers, acronyms, and product codes.
- **Reciprocal Rank Fusion (RRF)**: Combines dense vector and sparse lexical candidate pools.
- **Cross-Encoder Reranking**: Re-scores top fused candidates before evidence selection.

### 5. Verifiable Ground-Truth Citations
- Generated answers include audit-ready citation links pointing to the exact source document, page number, and source text snippet.

---

## 🏗️ System Architecture

```text
[ React Frontend ]
       │
       ▼ (1) POST /api/v1/chat/query (Bearer JWT)
[ Express API Gateway & Auth Guard ]
       │  (Extracts userId, tenantId, and roles from verified JWT)
       ▼
[ LangGraph Stateful RAG Workflow ]
       │
       ├── 1. Understand Query (Intent & Constraints)
       ├── 2. Transform Query (Sub-queries & Normalization)
       ├── 3. Route Query (Direct / Hybrid / Lexical)
       ├── 4. Authorised Parallel Retrieval:
       │        ├── pgvector Cosine Distance (<=>)
       │        └── tsvector Full-Text (GIN @@)
       │        (Both queries filtered by tenantId & user roles)
       ├── 5. Reciprocal Rank Fusion (RRF)
       ├── 6. Cross-Encoder Reranker
       ├── 7. Context Compression & Evidence Selection
       ├── 8. Grounded LLM Prompt Construction
       ├── 9. Citation-Aware Answer Generation
       └── 10. Evidence Validation & Safe Abstention
       │
       ▼ (2) Typed JSON Response with Clickable Citations
[ Client Displays Markdown Answer + Source Evidence Preview ]
```

---

## 📂 Repository Layout

```text
Knowra/
├── backend/
│   ├── src/
│   │   ├── config/              # Zod-validated environment settings (env.ts)
│   │   ├── db/                  # PostgreSQL pool and Drizzle ORM client
│   │   │   └── schema/          # Drizzle tables (tenants, users, roles, documents, chunks)
│   │   ├── middleware/          # JWT auth guard, multer upload, error handler
│   │   ├── routes/              # Express routers (/health, /api/v1/auth, /api/v1/documents)
│   │   ├── controllers/         # Request handlers with database transactions
│   │   ├── services/
│   │   │   ├── storage.service.ts # Local/S3 storage with SHA-256 deduplication
│   │   │   └── ingestion/       # Semantic document parsers (PDF, DOCX, CSV, TXT)
│   │   └── server.ts            # Express server bootstrap & graceful shutdown
│   ├── drizzle.config.ts        # Drizzle Kit migration configuration
│   ├── tsconfig.json            # NodeNext strict TypeScript configuration
│   ├── package.json
│   └── .env.example
├── explain/                     # Living architecture and visual database guides
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v15+ with the `pgvector` extension enabled
- **Redis** (Optional for caching): v7+

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/githimanshu29/Knowra.git
cd Knowra/backend
npm install
```

### 2. Configure Environment
Copy the example environment file and configure your database credentials:
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/knowra_db
JWT_SECRET=your_super_secret_key_at_least_32_characters_long
```

### 3. Run the Development Server
```bash
npm run dev
```

The server will start with hot-reload enabled at `http://localhost:5000`.

### 4. Health Check
Verify system status and database connectivity:
```bash
curl http://localhost:5000/health
```

Expected Response:
```json
{
  "status": "healthy",
  "service": "knowra-backend",
  "environment": "development",
  "timestamp": "2026-10-22T00:00:00.000Z",
  "database": true,
  "uptimeSeconds": 15
}
```

---

## 🧭 Ingestion Progress & Roadmap

- [x] Multi-Tenant Architecture & Database Schema
- [x] JWT Authentication & Role-Based Access Control (RBAC)
- [x] SHA-256 Document Deduplication & Storage Service
- [x] Semantic Parsers for PDF (page-aware), Word DOCX (heading hierarchy), CSV (table headers), and Markdown
- [ ] Hierarchical Semantic Chunker (Heading Propagation + Parent-Child Retrieval)
- [ ] Batch OpenAI Embeddings & PostgreSQL Dual Indexing (pgvector + tsvector)
- [ ] Hybrid Retrieval (RRF Fusion) & Cohere Reranker Service
- [ ] LangGraph Stateful Query Orchestrator
- [ ] Citation Validation & Abstention Engine
- [ ] React + TypeScript Enterprise Frontend

---







# 🏛️ Knowra Enterprise Advanced RAG: Complete System Architecture & Flow Map

Is document me **Knowra Platform** ka complete end-to-end architecture mapped hai. Isme **Ingestion Pipeline**, **Hierarchical Chunking**, **Embeddings Engine**, **PostgreSQL Storage (pgvector + tsvector)**, **Redis Caching Layer**, **Hybrid Retrieval (RRF)**, **Parent Context Swapping**, aur **LangGraph Agentic Orchestration** ko visually explain kiya gaya hai.

---

## 🗺️ 1. Master System Architecture Diagram

```text
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
                                       KNOWRA ENTERPRISE RAG ARCHITECTURE
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

                                 ┌──────────────────────────────────────────────┐
                                 │              ENTERPRISE CLIENT               │
                                 │   (Web Dashboard / API / Enterprise Slack)   │
                                 └──────────────┬────────────────┬──────────────┘
                                                │                │
                        [A] Document Upload     │                │   [B] Search / Chat Query
                        (Multipart Form-Data)   │                │   (JWT Bearer Token)
                                                ▼                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          EXPRESS 5 API GATEWAY LAYER                                              │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  • authenticate (JWT Verification + Tenant Context Extraction)                                                    │
│  • requireRoles (RBAC Authorization: Admin / Legal / Engineering / Viewer)                                        │
│  • upload.single('file') (Multer Memory Buffer Ceiling: 50MB)                                                     │
└───────────────────────┬────────────────────────────────────────────────────────┬──────────────────────────────────┘
                        │                                                        │
                        ▼                                                        ▼
   ┌─────────────────────────────────────────┐              ┌─────────────────────────────────────────┐
   │        INGESTION CONTROLLER             │              │          RETRIEVAL CONTROLLER           │
   │  • SHA-256 Checksum Duplicate Guard     │              │  • Tenant & Role Scope Extraction       │
   │  • saveFile (Tenant Isolated Disk)      │              │  • L1/L2 Redis Cache Check              │
   │  • Atomic DB Transaction (Doc+Version)  │              │  • LangGraph Stateful Workflow Trigger  │
   └────────────────────┬────────────────────┘              └────────────────────┬────────────────────┘
                        │                                                        │
                        ▼                                                        ▼
═════════════════════════════════════════════             ══════════════════════════════════════════════════════════
 ⚡ PHASE 1: ASYNC INGESTION PIPELINE                      🔍 PHASE 2: REAL-TIME HYBRID RETRIEVAL PIPELINE
═════════════════════════════════════════════             ══════════════════════════════════════════════════════════
                        │                                                        │
                        ▼                                                        ▼
         ┌──────────────────────────────┐                         ┌──────────────────────────────┐
         │ triggerIngestionWorker(jobId)│                         │     REDIS CACHING LAYER      │
         └──────────────┬───────────────┘                         │  • Exact Query Cache (TTL)   │
                        │                                         │  • Semantic Query Cache      │
                        ▼                                         └──────────────┬───────────────┘
         ┌──────────────────────────────┐                                        │ (Cache Miss)
         │   STAGE 1: STORAGE READ      │                                        ▼
         │   uploads/<tenant>/<file>    │                         ┌──────────────────────────────┐
         └──────────────┬───────────────┘                         │  QUERY REWRITING & EXPANSION │
                        │                                         │  • Acronym Expansion         │
                        ▼                                         │  • HyDE / Sub-Query Slicing  │
         ┌──────────────────────────────┐                         └──────────────┬───────────────┘
         │   STAGE 2: SEMANTIC PARSER   │                                        │
         │   • PDF (pdf-parse)          │                                        ▼
         │   • DOCX (mammoth)           │                         ┌──────────────────────────────┐
         │   • CSV (header-row aware)   │                         │  QUERY VECTOR EMBEDDING      │
         │   • Markdown / Text          │                         │  text-embedding-3-small      │
         │   Attach: page, source,      │                         │  (L2 Normalized Float Array) │
         │   timestamp, docType, RBAC   │                         └──────────────┬───────────────┘
         └──────────────┬───────────────┘                                        │
                        │                                                        │
                        ▼                                                        ▼
         ┌──────────────────────────────┐                    ┌────────────────────────────────────────┐
         │ STAGE 3: HIERARCHICAL        │                    │      DUAL-BRANCH HYBRID SEARCH         │
         │ SEMANTIC CHUNKER             │                    │      (PostgreSQL Hardware AVX)         │
         │                              │                    ├───────────────────┬────────────────────┤
         │ • Heading Breadcrumbs        │                    │ BRANCH 1: VECTOR  │ BRANCH 2: LEXICAL  │
         │   [Context: A > B > C]       │                    │ Cosine Distance   │ tsvector (English) │
         │                              │                    │ (<=> operator)    │ (@@ plainto_tsquery│
         │ • Macro Parent Chunks (~800t)│                    │ Top-20 Candidates │ Top-20 Candidates  │
         │   (parentChunkId = null)     │                    └─────────┬─────────┴──────────┬─────────┘
         │                              │                              │                    │
         │ • Micro Child Chunks (~200t) │                              └──────────┬─────────┘
         │   (parentChunkId = <parent>) │                                         │
         │                              │                                         ▼
         │ • Table Atomic Blocks        │                    ┌────────────────────────────────────────┐
         └──────────────┬───────────────┘                    │   RECIPROCAL RANK FUSION (RRF K=60)    │
                        │                                    │   Merge & Deduplicate Ranked Candidates│
                        ▼                                    └────────────────────┬───────────────────┘
         ┌──────────────────────────────┐                                         │
         │ STAGE 4: BATCH EMBEDDER      │                                         ▼
         │ • OpenAI text-embedding-3-sm │                    ┌────────────────────────────────────────┐
         │ • Batch Size: 64             │                    │     CROSS-ENCODER RERANKER (Top 5)     │
         │ • L2 Euclidean Normalization │                    │     High Precision Semantic Scoring    │
         │ • (Deterministic Fallback)   │                    └────────────────────┬───────────────────┘
         └──────────────┬───────────────┘                                         │
                        │                                                         ▼
                        │                                    ┌────────────────────────────────────────┐
                        │                                    │   PARENT CONTEXT SWAPPING ENGINE       │
                        │                                    │   Child Chunks match search ➔ Fetch    │
                        │                                    │   Full 800-Token Macro Parent Chunks   │
                        │                                    └────────────────────┬───────────────────┘
                        │                                                         │
                        ▼                                                         ▼
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 💾 SHARED PERSISTENCE & DATA STORAGE LAYER
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
       ▲                                                                          ▲
       │ Batch INSERT INTO chunks                                                 │ SELECT <=> / @@
       │                                                                          │
 ┌─────┴──────────────────────────────────────────────────────────────────────────┴───────────────────────────────┐
 │                                   POSTGRESQL 16 (WITH PGVECTOR & TSVECTOR)                                    │
 ├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │  • tenants:             id, name, slug, is_active                                                              │
 │  • users & roles:       id, tenant_id, email, password_hash, role_name                                         │
 │  • documents:           id, tenant_id, title, content_hash, storage_path, status ('READY'|'ERROR')             │
 │  • document_versions:   id, document_id, version_number, summary                                               │
 │  • ingestion_jobs:      id, tenant_id, document_id, status ('COMPLETED'), progress_percent (100)               │
 │  • chunks:              id, tenant_id, document_id, parent_chunk_id, content, token_count, heading_path,       │
 │                         embedding vector(1536) [HNSW Index], search_vector tsvector [GIN Index]               │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                                  │
                                                                                  ▼
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 🤖 PHASE 3: LANGGRAPH STATEFUL AGENTIC ORCHESTRATION & GENERATION
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
                                                                                  │
                        ┌─────────────────────────────────────────────────────────┴────────────────────────┐
                        ▼                                                                                  │
 ┌──────────────────────────────────────────────┐                                                          │
 │ LANGGRAPH NODE 1: CONTEXT COMPRESSION & FIT  │                                                          │
 │ • Assemble Parent Context within 4000 tokens │                                                          │
 │ • Format Evidence with Markdown Markers      │                                                          │
 └──────────────────────┬───────────────────────┘                                                          │
                        │                                                                                  │
                        ▼                                                                                  │
 ┌──────────────────────────────────────────────┐                                                          │
 │ LANGGRAPH NODE 2: GROUNDED GENERATION (LLM)  │                                                          │
 │ • System Prompt: Strict Evidence Grounding   │                                                          │
 │ • In-line Citation Generation [Source: Page] │                                                          │
 └──────────────────────┬───────────────────────┘                                                          │
                        │                                                                                  │
                        ▼                                                                                  │
 ┌──────────────────────────────────────────────┐                                                          │
 │ LANGGRAPH NODE 3: HALLUCINATION & FACT CHECK │                                                          │
 │ • Claim vs Retrieved Passage Verification    │                                                          │
 │ • If claims not in context ➔ Safe Abstention │                                                          │
 └──────────────────────┬───────────────────────┘                                                          │
                        │                                                                                  │
                        ▼                                                                                  ▼
 ┌──────────────────────────────────────────────┐                                        ┌────────────────────────┐
 │ STREAMING CLIENT RESPONSE                    │                                        │  REDIS CACHE WRITE     │
 │ • Verified Synthesized Answer                │                                        │  Save Query + Answer   │
 │ • Clickable Citations [doc_id, page, source] ├───────────────────────────────────────▶│  (TTL: 1 Hour)         │
 │ • Execution Latency Breakdown                │                                        └────────────────────────┘
 └──────────────────────────────────────────────┘
```

---

## 🧩 2. Core Components & Folder Structure

Knowra ka codebase clean enterprise modular patterns me structured hai:

```text
e:\AI\Advance-RAG\
├── backend\
│   ├── src\
│   │   ├── config\                 # Zod validated environment variables (DATABASE_URL, JWT, OpenAI, Redis)
│   │   ├── db\
│   │   │   ├── schema\             # Drizzle ORM Relational Schemas
│   │   │   │   ├── auth.ts         # tenants, users, roles, user_roles
│   │   │   │   ├── documents.ts    # documents, document_versions, chunks, ingestion_jobs
│   │   │   │   └── index.ts        # Central schema re-exports
│   │   │   └── index.ts            # PostgreSQL Pool & Drizzle Client
│   │   ├── middleware\             # Express Middlewares
│   │   │   ├── auth.ts             # JWT authentication & requireRoles RBAC guard
│   │   │   ├── upload.ts           # Multer 50MB ceiling, MIME filter
│   │   │   └── errorHandler.ts     # Global error catching & standard JSON error responses
│   │   ├── services\
│   │   │   ├── storage.service.ts  # SHA-256 duplicate hash, tenant-isolated disk storage
│   │   │   ├── ingestion\          # Phase 1: Ingestion Engine
│   │   │   │   ├── parsers.ts      # Multi-format page-aware parsers (PDF, DOCX, CSV, TXT, MD)
│   │   │   │   ├── chunker.ts      # Hierarchical Semantic Chunker (Parent-Child, Breadcrumbs)
│   │   │   │   ├── embedder.ts     # OpenAI text-embedding-3-small batch embedder + Normalizer
│   │   │   │   └── worker.ts       # 7-Stage state machine job runner
│   │   │   └── retrieval\          # Phase 2: Hybrid Search Engine (Next Step)
│   │   │       ├── hybridSearch.ts # pgvector <=> + tsvector @@ + Reciprocal Rank Fusion
│   │   │       ├── reranker.ts     # Cross-encoder precision reranker
│   │   │       └── parentSwap.ts   # Child chunk match -> Parent macro context expansion
│   │   ├── graph\                  # Phase 3: LangGraph Agentic Workflow
│   │   │   ├── state.ts            # LangGraph State Definition
│   │   │   ├── nodes\              # Query, Retrieve, Generate, CitationVerify nodes
│   │   │   └── workflow.ts         # Compiled StateGraph workflow
│   │   ├── controllers\            # Express API Endpoint Controllers
│   │   ├── routes\                 # Health, Auth, Documents, Chat routes
│   │   └── server.ts               # Express bootstrapper & graceful lifecycle
│   └── uploads\                    # Local tenant isolated document files
└── explain\                        # Visual Hinglish documentation & architecture guides
```

---

## 🔄 3. Detailed Flow: Ingestion Pipeline (Upload ➔ Chunks)

```text
1. Client POST /api/v1/documents/upload (Headers: Authorization Bearer <token>)
   │
2. authenticate middleware:
   - Validates JWT token
   - Attaches req.user = { userId, tenantId, email, roles }
   │
3. upload.single('file') middleware:
   - Memory buffer check: file size <= 50MB
   - MIME validation: PDF, DOCX, CSV, TXT, MD
   │
4. document.controller.ts:
   - Computes SHA-256 hash = crypto.createHash('sha256').update(file.buffer).digest('hex')
   - Checks DB for duplicate hash inside this tenant:
     • Agar already exist karta hai ➔ 200 OK (Duplicate Detected)
     • Agar new hai ➔ Disk par write karta hai: uploads/<tenantId>/<timestamp>-<name>
   - Runs atomic DB Transaction:
     • INSERT INTO documents (status: 'QUEUED')
     • INSERT INTO document_versions (version_number: 1)
     • INSERT INTO ingestion_jobs (status: 'QUEUED', progress_percent: 0)
   - Returns HTTP 201 Created to client immediately: { documentId, jobId, status: 'QUEUED' }
   - Dispatches background job: triggerIngestionWorker(jobId)
   │
5. worker.ts (7-Stage Processing):
   ├── Stage 1 (10%):  Set ingestion_jobs.status = 'PROCESSING'
   ├── Stage 2 (20%):  Disk se raw file binary buffer read karta hai
   ├── Stage 3 (30%):  parsers.ts se document ko parse karta hai:
   │                   Output: SemanticBlock[] (headings, tables, paragraphs + page numbers)
   ├── Stage 4 (50%):  chunker.ts se hierarchical chunks banata hai:
   │                   • Macro Parent Chunks (~800 tokens, parentChunkId = null)
   │                   • Micro Child Chunks (~200 tokens, parentChunkId = <parent UUID>)
   │                   • Heading Breadcrumbs: [Context: Topic > Subtopic]
   ├── Stage 5 (70%):  embedder.ts se OpenAI text-embedding-3-small call karta hai:
   │                   Output: 1536-dimensional L2-normalized float arrays
   ├── Stage 6 (85%):  PostgreSQL chunks table me batch insert (25 rows per batch):
   │                   • embedding = 1536 floats
   │                   • search_vector = to_tsvector('english', content)
   └── Stage 7 (100%): Document summary update, documents.status = 'READY',
                       ingestion_jobs.status = 'COMPLETED', progress_percent = 100.
```

---

## ⚡ 4. Detailed Flow: Hybrid Retrieval & Generation Pipeline

```text
1. Client POST /api/v1/chat/query { "query": "What is our Q2 growth rate in engineering?" }
   │
2. Auth & Tenant Guard:
   - Extract tenantId from JWT
   │
3. Redis L1 Cache Check:
   - Key: tenant:<tenantId>:query:<queryHash>
   - IF HIT ➔ Return cached synthesized answer with citations in 5ms!
   - IF MISS ➔ Proceed to Hybrid Retrieval Engine
   │
4. Dual-Branch Search in PostgreSQL (Parallel Execution):
   ├── Branch A: Vector Cosine Distance
   │   - Embed user query using text-embedding-3-small (1536 floats)
   │   - SQL: SELECT id, parent_chunk_id, content, 1 - (embedding <=> $queryVec) AS score
   │          FROM chunks WHERE tenant_id = $tenantId AND chunk_strategy IN ('child', 'table')
   │          ORDER BY score DESC LIMIT 20
   │
   └── Branch B: Lexical Full-Text Search
       - Extract keyword tokens: 'engineering' & 'growth' & 'rate'
       - SQL: SELECT id, parent_chunk_id, content, ts_rank_cd(search_vector, plainto_tsquery($query)) AS rank
              FROM chunks WHERE tenant_id = $tenantId AND search_vector @@ plainto_tsquery($query)
              ORDER BY rank DESC LIMIT 20
   │
5. Reciprocal Rank Fusion (RRF Algorithm, k = 60):
   - For every candidate chunk: RRF_Score = 1/(60 + Rank_Vector) + 1/(60 + Rank_Lexical)
   - Merges and sorts top candidates without score scaling bias
   │
6. Cross-Encoder Reranker:
   - Takes top 15 RRF candidates
   - Scores (Query, Passage) pairs using cross-attention
   - Selects Top 3 - 5 highest scoring chunks
   │
7. Parent Context Swapping:
   - Match huye child chunks ke `parent_chunk_id` ko check karta hai
   - SQL: SELECT id, content FROM chunks WHERE id IN (child.parent_chunk_id)
   - LLM ke prompt me 100-token ka adhoora sentence bhejne ke bajaye
     poora 800-token macro parent paragraph inject karta hai!
   │
8. LangGraph Orchestration:
   - Node 1: Prompt Context Builder (Evidence assemble karta hai)
   - Node 2: LLM Generation (Synthesizes answer strictly citing [Document: Page])
   - Node 3: Citation Verification Guard (Checks if citations exist in context)
   │
9. Return Stream to Client:
   - Streamed answer + Verifiable Citations + Execution Latencies
   - Writes result to Redis Cache (TTL = 1 hour)
```

---

## 🗄️ 5. Database Schema Relational Map

```text
┌───────────────────────┐
│        tenants        │
│ id (PK)               │◀──────────┐
│ name, slug, is_active │           │
└───────────┬───────────┘           │
            │ 1:N                   │
            ▼                       │
┌───────────────────────┐           │
│         users         │           │
│ id (PK)               │           │
│ tenant_id (FK)        │           │
│ email, password_hash  │           │
└───────────┬───────────┘           │
            │ 1:N                   │
            ▼                       │
┌───────────────────────┐           │
│      user_roles       │           │
│ user_id, role_id      │           │
└───────────────────────┘           │
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│ DOCUMENTS & CHUNKS HIERARCHY      │                                   │
│                                   │                                   │
│  ┌─────────────────────────┐      │                                   │
│  │        documents        │      │                                   │
│  │ id (PK)                 │      │                                   │
│  │ tenant_id (FK) ─────────┼──────┘                                   │
│  │ storage_path, hash      │                                          │
│  │ status ('READY'|'ERROR')│                                          │
│  └────────────┬────────────┘                                          │
│               │ 1:N                                                   │
│               ▼                                                       │
│  ┌─────────────────────────┐         ┌─────────────────────────────┐  │
│  │    document_versions    │         │       ingestion_jobs        │  │
│  │ id (PK)                 │         │ id (PK)                     │  │
│  │ document_id (FK)        │◀────────┤ document_id (FK)            │  │
│  │ version_number, summary │         │ status, progress_percent    │  │
│  └────────────┬────────────┘         └─────────────────────────────┘  │
│               │ 1:N                                                   │
│               ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                            chunks                            │     │
│  │ id (PK)                                                      │     │
│  │ tenant_id (FK -> tenants.id CASCADE)                         │     │
│  │ document_id (FK -> documents.id CASCADE)                     │     │
│  │ version_id (FK -> document_versions.id CASCADE)              │     │
│  │ parent_chunk_id (UUID Self-Reference ──┐)                    │     │
│  │ chunk_strategy ('parent' | 'child' | 'table' | 'semantic')   │     │
│  │ content (text with context breadcrumbs)                      │     │
│  │ token_count (int)                                            │     │
│  │ heading_path (varchar)                                       │     │
│  │ embedding (vector 1536) ────▶ [HNSW Index for Cosine Search] │     │
│  │ search_vector (tsvector) ───▶ [GIN Index for Lexical Search] │     │
│  └───────────────────────────────────────▲──────────────────────┘     │
│                                          │                            │
│                                          └─ (parentChunkId links)     │
└───────────────────────────────────────────────────────────────────────┘
```













## 📄 License
This project is licensed under the ISC License.
