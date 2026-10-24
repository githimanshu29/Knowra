// Express request and response types
import { Request, Response } from 'express';
// Zod chat validation schema
import { chatQuerySchema } from '../schemas/chat.schema.js';
// LangGraph agent orchestrator entrypoint
import { executeKnowraQuery } from '../graph/index.js';

// Helper function to write Server-Sent Events (SSE) payloads formatted with event and data blocks
// returns: void
function sendSseEvent(res: Response, eventName: string, dataPayload: unknown): void {
  const jsonString = JSON.stringify(dataPayload);
  res.write(`event: ${eventName}\ndata: ${jsonString}\n\n`);
}

// Controller: Handles standard JSON and Server-Sent Event (SSE) streaming chat queries
// returns: Promise<void>
export async function chatQueryHandler(req: Request, res: Response): Promise<void> {
  // Validate request body against Zod chat schema
  const parsedBody = chatQuerySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: 'Validation Error',
      details: parsedBody.error.flatten().fieldErrors,
    });
    return;
  }

  // Ensure user identity is provided by authentication middleware
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'User authentication context is required for chat queries',
    });
    return;
  }

  const { query, stream } = parsedBody.data;
  const { tenantId, userId, roles } = req.user;
  const isSuperAdmin = roles.includes('super_admin') || roles.includes('admin');

  // Case 1: Server-Sent Events (SSE) Streaming Response
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    try {
      // 1. Emit query analysis event
      sendSseEvent(res, 'status', {
        step: 'analysis',
        message: 'Analyzing user query and intent...',
      });

      // 2. Execute full LangGraph orchestrator
      const finalState = await executeKnowraQuery(query, tenantId, {
        userId,
        roleIds: roles,
        isSuperAdmin,
      });

      if (clientDisconnected) return;

      // 3. Emit retrieval and reranking completion status
      sendSseEvent(res, 'status', {
        step: 'retrieval_complete',
        message: `Retrieved ${finalState.retrievedCandidates.length} candidate chunks, selected ${finalState.rerankedEvidence.length} evidence sources.`,
      });

      // 4. Stream response tokens smoothly
      const words = finalState.generatedAnswer.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (clientDisconnected) return;
        const wordChunk = (i === 0 ? '' : ' ') + words[i];
        sendSseEvent(res, 'token', { text: wordChunk });
      }

      // 5. Emit verified citations and security evaluation metadata
      sendSseEvent(res, 'citations', {
        citations: finalState.citations,
        abstentionFlag: finalState.abstentionFlag,
        isSecurityFlagged: finalState.isSecurityFlagged || false,
        securityViolationReason: finalState.securityViolationReason,
        piiEntitiesDetected: finalState.piiEntitiesDetected || [],
      });

      // 6. Emit completion with execution metrics
      sendSseEvent(res, 'done', {
        executionMetrics: finalState.executionMetrics,
      });

      res.end();
      return;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Internal streaming failure';
      sendSseEvent(res, 'error', { error: errorMessage });
      res.end();
      return;
    }
  }

  // Case 2: Standard JSON Response
  try {
    const finalState = await executeKnowraQuery(query, tenantId, {
      userId,
      roleIds: roles,
      isSuperAdmin,
    });

    res.status(200).json({
      query: finalState.query,
      answer: finalState.generatedAnswer,
      citations: finalState.citations,
      abstentionFlag: finalState.abstentionFlag,
      isSecurityFlagged: finalState.isSecurityFlagged || false,
      securityViolationReason: finalState.securityViolationReason,
      piiEntitiesDetected: finalState.piiEntitiesDetected || [],
      executionMetrics: finalState.executionMetrics,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal query processing failure';
    res.status(500).json({
      error: 'Query Execution Failed',
      message: errorMessage,
    });
  }
}
