// Integration test script for Chat Controller and Server-Sent Events (SSE) Streaming API
import { AddressInfo } from 'net';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, users } from '../db/schema/index.js';
import { generateAccessToken } from '../utils/security.js';
import { app } from '../server.js';

// Executes end-to-end HTTP verification of Chat API
// returns: Promise<void>
async function runChatApiVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA STEP 15: CHAT CONTROLLER & SSE STREAMING TEST');
  console.log('=====================================================\n');

  // 1. Start ephemeral HTTP server on dynamic port
  console.log('[1/5] Starting ephemeral HTTP test server...');
  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${address.port}`;
  console.log(`Ephemeral Test Server listening on: ${baseUrl}\n`);

  try {
    // 2. Fetch active tenant and user from database
    console.log('[2/5] Preparing test credentials from database...');
    const tenant = await db.query.tenants.findFirst();

    if (!tenant) {
      throw new Error('Tenant record not found in database.');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.tenantId, tenant.id),
    });

    if (!user) {
      throw new Error('User record not found in database.');
    }

    // Generate valid test JWT token
    const validToken = generateAccessToken({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      roles: ['admin', 'super_admin'],
      roleIds: ['11111111-1111-4111-8111-111111111111'],
      isSuperAdmin: true,
    });

    console.log(`Tenant:   ${tenant.name} (${tenant.id})`);
    console.log(`User:     ${user.fullName} (${user.id})`);
    console.log(`JWT Auth: Bearer ${validToken.slice(0, 20)}...\n`);

    // 3. Test 1: Standard JSON Chat Query (POST /api/v1/chat/query)
    console.log('[3/5] Testing Standard JSON Chat Endpoint (stream: false)...');
    const jsonQueryPayload = {
      query: 'How does Knowra enforce multi-tenant isolation and security?',
      stream: false,
    };

    const jsonResponse = await fetch(`${baseUrl}/api/v1/chat/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsonQueryPayload),
    });

    console.log(`HTTP Status: ${jsonResponse.status} ${jsonResponse.statusText}`);

    if (!jsonResponse.ok) {
      const errorText = await jsonResponse.text();
      throw new Error(`Chat API request failed: ${errorText}`);
    }

    const jsonData = (await jsonResponse.json()) as {
      query: string;
      answer: string;
      citations: Array<{ citationTag: string; documentId: string }>;
      abstentionFlag: boolean;
      executionMetrics: Record<string, number>;
    };

    console.log(`- Query:           "${jsonData.query}"`);
    console.log(`- Abstention:      ${jsonData.abstentionFlag}`);
    console.log(`- Citations Count: ${jsonData.citations.length}`);
    console.log(`- Total Duration:  ${jsonData.executionMetrics.totalDurationMs} ms`);
    console.log(`- Answer Preview:\n  ${jsonData.answer.slice(0, 200)}...\n`);

    // 4. Test 2: Server-Sent Events (SSE) Streaming (POST /api/v1/chat/stream)
    console.log('[4/5] Testing Server-Sent Events (SSE) Streaming Endpoint...');
    const sseResponse = await fetch(`${baseUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'What search branches does Knowra combine in hybrid retrieval?',
      }),
    });

    console.log(`HTTP Status: ${sseResponse.status} ${sseResponse.statusText}`);
    console.log(`Content-Type: ${sseResponse.headers.get('content-type')}`);

    if (!sseResponse.ok || !sseResponse.body) {
      throw new Error('SSE stream response failed or body is null');
    }

    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedTokens = '';
    let eventCount = 0;
    let receivedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          eventCount++;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.text) {
              accumulatedTokens += parsed.text;
            }
            if (parsed.step) {
              console.log(`  [SSE Status]: ${parsed.step} -> ${parsed.message}`);
            }
            if (parsed.citations) {
              console.log(`  [SSE Citations]: ${parsed.citations.length} verified evidence chunks.`);
            }
            if (parsed.executionMetrics) {
              receivedDone = true;
              console.log(`  [SSE Done]: Total duration ${parsed.executionMetrics.totalDurationMs} ms`);
            }
          } catch {
            // Ignore partial non-JSON line chunks
          }
        }
      }
    }

    console.log(`\nTotal Stream Events Received: ${eventCount}`);
    console.log(`Accumulated Streamed Text:\n${accumulatedTokens.slice(0, 220)}...\n`);

    if (!receivedDone || accumulatedTokens.length === 0) {
      throw new Error('FAILED: SSE stream did not emit tokens or complete properly.');
    }

    // 5. Test 3: Unauthorized Security Barrier
    console.log('[5/5] Testing Authentication Barrier (Missing Token)...');
    const unauthorizedResponse = await fetch(`${baseUrl}/api/v1/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'Hello' }),
    });

    console.log(`Unauthorized HTTP Status: ${unauthorizedResponse.status} (Expected: 401)`);
    if (unauthorizedResponse.status === 401) {
      console.log('SUCCESS: Unauthorized request strictly rejected.\n');
    } else {
      throw new Error(`SECURITY FLAW: Expected status 401 but received ${unauthorizedResponse.status}`);
    }

    console.log('=====================================================');
    console.log('STEP 15 CHAT API & SSE STREAMING VERIFIED SUCCESSFULLY!');
    console.log('=====================================================');
  } finally {
    server.close();
  }
}

runChatApiVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Chat API verification failed:', err);
    process.exit(1);
  });
