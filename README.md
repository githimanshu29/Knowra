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

## 📄 License
This project is licensed under the ISC License.
