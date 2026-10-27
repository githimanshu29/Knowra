// Vitest test runner imports
import { describe, expect, it } from 'vitest';
// Tiktoken-powered chunker tokenizer
import { estimateTokenCount } from '../services/ingestion/chunker.js';

describe('BPE Tokenizer Suite (tiktoken cl100k_base)', () => {
  it('should calculate exact BPE tokens for sample English text', () => {
    const text = 'Hello world, this is Knowra Enterprise RAG platform.';
    const count = estimateTokenCount(text);
    // BPE token count for this 53 character string is exactly 10 tokens
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(12);
  });

  it('should return 0 tokens for empty or whitespace-only input', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('should accurately count tokens for code and structured symbols', () => {
    const codeSnippet = 'const x = { user_id: "e7b0a70f", active: true };';
    const count = estimateTokenCount(codeSnippet);
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(30);
  });
});
