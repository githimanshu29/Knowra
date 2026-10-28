// Axios HTTP client instance and configuration
import axios from 'axios';

// Base API URL pointing to Express 5 backend
const API_BASE_URL = 'http://localhost:5000/api/v1';

// Axios instance with default headers
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor injecting JWT bearer token from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('knowra_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor handling unauthorized 401 events
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token on authentication expiry
      localStorage.removeItem('knowra_token');
      localStorage.removeItem('knowra_user');
    }
    return Promise.reject(error);
  }
);

// TypeScript Concept: Interface
// Shape of authenticated user profile
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  tenantId: string;
  roleIds: string[];
}

// Shape of citation evidence item
export interface CitationItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  headingPath: string | null;
  sourceSnippet: string;
  relevanceScore: number;
}

// Shape of chat query response
export interface ChatQueryResponse {
  answer: string;
  citations: CitationItem[];
  conversationId: string;
  groundingScore: number;
  groundingWarning?: string | null;
  isGrounded?: boolean;
  latencies?: Record<string, number>;
}

// Shape of document entity
export interface DocumentItem {
  id: string;
  tenantId: string;
  title: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  isPublicWithinTenant: boolean;
  status: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR';
  createdAt: string;
  errorMessage?: string | null;
}

// Shape of conversation entity
export interface ConversationItem {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// Shape of message entity
export interface MessageItem {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: CitationItem[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// API Service Call Wrappers
export const knowraApi = {
  // 1. Authentication
  login: async (tenantSlug: string, email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { tenantSlug, email, password });
    return res.data;
  },

  registerTenant: async (data: {
    tenantName: string;
    tenantSlug: string;
    adminEmail: string;
    adminPassword: string;
    adminFullName: string;
    name?: string;
    slug?: string;
  }) => {
    const payload = {
      tenantName: data.tenantName || data.name,
      tenantSlug: data.tenantSlug || data.slug,
      name: data.name || data.tenantName,
      slug: data.slug || data.tenantSlug,
      adminEmail: data.adminEmail,
      adminPassword: data.adminPassword,
      adminFullName: data.adminFullName,
    };
    const res = await apiClient.post('/auth/register-tenant', payload);
    return res.data;
  },

  // 2. Documents
  getDocuments: async (): Promise<DocumentItem[]> => {
    const res = await apiClient.get('/documents');
    return res.data.documents || [];
  },

  getDocument: async (id: string) => {
    const res = await apiClient.get(`/documents/${id}`);
    return res.data;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await apiClient.delete(`/documents/${id}`);
  },

  updateAccessLevel: async (id: string, isPublicWithinTenant: boolean): Promise<void> => {
    await apiClient.patch(`/documents/${id}/access-level`, { isPublicWithinTenant });
  },

  addPermission: async (documentId: string, roleId?: string, userId?: string, permissionLevel = 'read'): Promise<void> => {
    await apiClient.post(`/documents/${documentId}/permissions`, { roleId, userId, permissionLevel });
  },

  deletePermission: async (documentId: string, permissionId: string): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}/permissions/${permissionId}`);
  },

  uploadDocument: async (file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiClient.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  // 3. Conversations & Chat
  getConversations: async (): Promise<ConversationItem[]> => {
    const res = await apiClient.get('/chat/conversations');
    return res.data.conversations || [];
  },

  getConversation: async (id: string): Promise<{ conversation: ConversationItem; messages: MessageItem[] }> => {
    const res = await apiClient.get(`/chat/conversations/${id}`);
    const messages = res.data.messages || res.data.conversation?.messages || [];
    return {
      conversation: res.data.conversation,
      messages,
    };
  },

  deleteConversation: async (id: string): Promise<void> => {
    await apiClient.delete(`/chat/conversations/${id}`);
  },

  querySync: async (query: string, conversationId?: string): Promise<ChatQueryResponse> => {
    const res = await apiClient.post('/chat/query', { query, conversationId, stream: false });
    return res.data;
  },

  // Server-Sent Events Streaming Reader
  streamQuery: async (
    query: string,
    conversationId: string | undefined,
    callbacks: {
      onToken: (token: string) => void;
      onCitations: (citations: CitationItem[], groundingScore: number, isGrounded?: boolean, warning?: string | null) => void;
      onDone: (convId: string) => void;
      onError: (err: string) => void;
    }
  ): Promise<void> => {
    const token = localStorage.getItem('knowra_token');
    const response = await fetch(`${API_BASE_URL}/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ query, conversationId, stream: true }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({ error: 'Network streaming request failed' }));
      callbacks.onError(errJson.error || 'Server stream connection failed');
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError('ReadableStream body not supported in browser environment');
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        let eventType = 'message';
        let dataStr = '';

        for (const subLine of line.split('\n')) {
          if (subLine.startsWith('event:')) {
            eventType = subLine.slice(6).trim();
          } else if (subLine.startsWith('data:')) {
            dataStr = subLine.slice(5).trim();
          }
        }

        if (eventType === 'token' && dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            callbacks.onToken(parsed.token || parsed.text || '');
          } catch {
            callbacks.onToken(dataStr);
          }
        } else if (eventType === 'citations' && dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            callbacks.onCitations(
              parsed.citations || [],
              parsed.groundingScore ?? 1.0,
              parsed.isGrounded,
              parsed.groundingWarning
            );
          } catch (e) {
            console.error('Citations parsing error:', e);
          }
        } else if (eventType === 'done' && dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            callbacks.onDone(parsed.conversationId);
          } catch {
            callbacks.onDone('');
          }
        } else if (eventType === 'error' && dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            callbacks.onError(parsed.error || 'Stream error event received');
          } catch {
            callbacks.onError(dataStr);
          }
        }
      }
    }
  },
};
