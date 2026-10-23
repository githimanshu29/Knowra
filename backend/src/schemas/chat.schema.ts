// Zod library for validating chat request payloads
import { z } from 'zod';

// Zod schema for validating conversational user query submissions
export const chatQuerySchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query exceeds 2000 character maximum limit'),
  stream: z.boolean().default(false),
});

// TypeScript Concept: z.infer
// Automatically derives the TypeScript type from the Zod validation schema
export type ChatQueryInput = z.infer<typeof chatQuerySchema>;
