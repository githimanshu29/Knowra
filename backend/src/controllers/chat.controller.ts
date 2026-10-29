// Express request and response types
import { NextFunction, Request, Response } from 'express';
// Drizzle query operators
import { and, asc, desc, eq, sql } from 'drizzle-orm';
// LangChain message types
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
// Database client instance
import { db } from '../db/index.js';
// Conversations and messages tables
import { conversations, messages } from '../db/schema/index.js';
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

  const { query, stream, conversationId, documentId } = parsedBody.data;
  const { tenantId, userId, roles, roleIds } = req.user;
  const isSuperAdmin =
    Boolean(req.user.isSuperAdmin) ||
    roles.some((r) => r.toUpperCase() === 'ADMIN' || r.toUpperCase() === 'SUPER_ADMIN');

  // Load previous conversation history if conversationId is specified
  let conversationHistory: BaseMessage[] = [];
  if (conversationId) {
    const existingConversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, tenantId),
        isSuperAdmin ? sql`1=1` : eq(conversations.userId, userId)
      ),
    });

    if (!existingConversation) {
      res.status(404).json({ error: 'Not Found', message: 'Conversation not found or access denied' });
      return;
    }

    const previousMsgs = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
    });

    conversationHistory = previousMsgs.map((m) => {
      if (m.role === 'assistant') {
        return new AIMessage(m.content);
      }
      return new HumanMessage(m.content);
    });
  }

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
      // Emit query analysis event
      sendSseEvent(res, 'status', {
        step: 'analysis',
        message: 'Analyzing user query and intent...',
      });

      // Execute full LangGraph orchestrator with real-time token streaming callback
      const finalState = await executeKnowraQuery(query, tenantId, {
        userId,
        roleIds: roleIds || [],
        isSuperAdmin,
        documentId: documentId || undefined,
        messages: conversationHistory,
        streamTokenCallback: (token: string) => {
          if (!clientDisconnected) {
            sendSseEvent(res, 'token', { text: token, token });
          }
        },
      });

      if (clientDisconnected) return;

      // Emit retrieval and reranking completion status
      sendSseEvent(res, 'status', {
        step: 'retrieval_complete',
        message: `Retrieved ${finalState.retrievedCandidates.length} candidate chunks, selected ${finalState.rerankedEvidence.length} evidence sources.`,
      });

      // Emit verified citations and grounding evaluation metadata with warning flag if ungrounded
      const isGrounded = (finalState.groundingScore ?? 1.0) >= 0.6;
      sendSseEvent(res, 'citations', {
        citations: finalState.citations,
        groundingScore: finalState.groundingScore,
        isGrounded,
        groundingWarning: isGrounded ? null : 'Generated claims could not be fully substantiated by source documents',
        abstentionFlag: finalState.abstentionFlag,
        isSecurityFlagged: finalState.isSecurityFlagged || false,
        securityViolationReason: finalState.securityViolationReason,
        piiEntitiesDetected: finalState.piiEntitiesDetected || [],
      });

      // Persist conversation messages to database
      let effectiveConvId = conversationId;
      if (!effectiveConvId) {
        const [newConv] = await db
          .insert(conversations)
          .values({
            tenantId,
            userId,
            title: query.slice(0, 60),
          })
          .returning();
        effectiveConvId = newConv?.id;
      }

      if (effectiveConvId) {
        await db.insert(messages).values([
          {
            conversationId: effectiveConvId,
            role: 'user',
            content: query,
          },
          {
            conversationId: effectiveConvId,
            role: 'assistant',
            content: finalState.generatedAnswer,
            citations: finalState.citations,
            metadata: finalState.executionMetrics,
          },
        ]);
      }

      // Emit completion with execution metrics and conversation ID
      sendSseEvent(res, 'done', {
        conversationId: effectiveConvId,
        executionMetrics: finalState.executionMetrics,
      });

      res.end();
      return;
    } catch (err: unknown) {
      const detailedError = err instanceof Error ? err.message : String(err);
      console.error('Chat streaming execution internal error:', detailedError, err);
      sendSseEvent(res, 'error', {
        error: detailedError || 'The knowledge intelligence streaming service encountered an unexpected error. Please try again.',
      });
      res.end();
      return;
    }
  }

  // Case 2: Standard JSON Response
  try {
    const finalState = await executeKnowraQuery(query, tenantId, {
      userId,
      roleIds: roleIds || [],
      isSuperAdmin,
      documentId: documentId || undefined,
      messages: conversationHistory,
    });

    let effectiveConvId = conversationId;
    if (!effectiveConvId) {
      const [newConv] = await db
        .insert(conversations)
        .values({
          tenantId,
          userId,
          title: query.slice(0, 60),
        })
        .returning();
      effectiveConvId = newConv?.id;
    }

    if (effectiveConvId) {
      await db.insert(messages).values([
        {
          conversationId: effectiveConvId,
          role: 'user',
          content: query,
        },
        {
          conversationId: effectiveConvId,
          role: 'assistant',
          content: finalState.generatedAnswer,
          citations: finalState.citations,
          metadata: finalState.executionMetrics,
        },
      ]);
    }

    res.status(200).json({
      conversationId: effectiveConvId,
      query: finalState.query,
      answer: finalState.generatedAnswer,
      citations: finalState.citations,
      groundingScore: finalState.groundingScore,
      abstentionFlag: finalState.abstentionFlag,
      isSecurityFlagged: finalState.isSecurityFlagged || false,
      securityViolationReason: finalState.securityViolationReason,
      piiEntitiesDetected: finalState.piiEntitiesDetected || [],
      executionMetrics: finalState.executionMetrics,
    });
  } catch (err: unknown) {
    const detailedError = err instanceof Error ? err.message : String(err);
    console.error('Chat query execution internal error:', detailedError, err);
    res.status(500).json({
      error: 'Query Execution Failed',
      message: detailedError || 'The knowledge intelligence service encountered an unexpected error. Please try again.',
    });
  }
}

// Creates a new conversation thread for the authenticated user
// returns: Promise<void> responds with 201 json { conversation: object }
export async function createConversationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const { title = 'New Conversation' } = req.body;

    const [newConv] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId,
        title,
      })
      .returning();

    res.status(201).json({ conversation: newConv });
  } catch (error) {
    next(error);
  }
}

// Lists all conversation threads belonging to authenticated user
// returns: Promise<void> responds with 200 json { conversations: Array<Conversation> }
export async function listConversationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const convList = await db.query.conversations.findMany({
      where: and(eq(conversations.tenantId, tenantId), eq(conversations.userId, userId)),
      orderBy: [desc(conversations.updatedAt)],
    });

    res.status(200).json({ conversations: convList });
  } catch (error) {
    next(error);
  }
}

// Retrieves conversation thread with chronological message history
// returns: Promise<void> responds with 200 json { conversation: object, messages: Array<Message> }
export async function getConversationDetailsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const isSuperAdmin =
      Boolean(req.user!.isSuperAdmin) ||
      (req.user!.roles && req.user!.roles.some((r) => r.toUpperCase() === 'ADMIN' || r.toUpperCase() === 'SUPER_ADMIN'));
    const conversationId = req.params.id as string;

    const conv = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, tenantId),
        isSuperAdmin ? sql`1=1` : eq(conversations.userId, userId)
      ),
      with: {
        messages: {
          orderBy: [asc(messages.createdAt)],
        },
      },
    });

    if (!conv) {
      res.status(404).json({ error: 'Not Found', message: 'Conversation not found' });
      return;
    }

    res.status(200).json({
      conversation: conv,
      messages: conv.messages || [],
    });
  } catch (error) {
    next(error);
  }
}

// Deletes a conversation thread and its associated messages
// returns: Promise<void> responds with 200 json { message: string, id: string }
export async function deleteConversationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const isSuperAdmin =
      Boolean(req.user!.isSuperAdmin) ||
      (req.user!.roles && req.user!.roles.some((r) => r.toUpperCase() === 'ADMIN' || r.toUpperCase() === 'SUPER_ADMIN'));
    const conversationId = req.params.id as string;

    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, tenantId),
        isSuperAdmin ? sql`1=1` : eq(conversations.userId, userId)
      ),
    });

    if (!existing) {
      res.status(404).json({ error: 'Not Found', message: 'Conversation not found or access denied' });
      return;
    }

    await db.delete(conversations).where(eq(conversations.id, conversationId));

    res.status(200).json({ message: 'Conversation deleted successfully', id: conversationId });
  } catch (error) {
    next(error);
  }
}
