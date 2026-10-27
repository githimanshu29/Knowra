// Redux Toolkit slice for chat conversations, messages, streaming and evidence
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CitationItem, ConversationItem, MessageItem } from '../../services/api.js';

// State interface for chat and retrieval studio
export interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: MessageItem[];
  isStreaming: boolean;
  streamingText: string;
  streamingCitations: CitationItem[];
  streamingGroundingScore: number;
  streamingGroundingWarning: string | null;
  activeEvidence: CitationItem | null;
  isEvidenceDrawerOpen: boolean;
}

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  streamingCitations: [],
  streamingGroundingScore: 1.0,
  streamingGroundingWarning: null,
  activeEvidence: null,
  isEvidenceDrawerOpen: false,
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setConversations: (state, action: PayloadAction<ConversationItem[]>) => {
      state.conversations = action.payload;
    },
    setActiveConversationId: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },
    setMessages: (state, action: PayloadAction<MessageItem[]>) => {
      state.messages = action.payload;
    },
    addMessage: (state, action: PayloadAction<MessageItem>) => {
      state.messages.push(action.payload);
    },
    startStreaming: (state) => {
      state.isStreaming = true;
      state.streamingText = '';
      state.streamingCitations = [];
      state.streamingGroundingScore = 1.0;
      state.streamingGroundingWarning = null;
    },
    appendStreamToken: (state, action: PayloadAction<string>) => {
      state.streamingText += action.payload;
    },
    setStreamCitations: (
      state,
      action: PayloadAction<{
        citations: CitationItem[];
        groundingScore: number;
        warning?: string | null;
      }>
    ) => {
      state.streamingCitations = action.payload.citations;
      state.streamingGroundingScore = action.payload.groundingScore;
      state.streamingGroundingWarning = action.payload.warning || null;
    },
    finalizeStream: (state, action: PayloadAction<{ id: string; conversationId: string }>) => {
      state.isStreaming = false;
      const newAssistantMsg: MessageItem = {
        id: action.payload.id,
        conversationId: action.payload.conversationId,
        role: 'assistant',
        content: state.streamingText,
        citations: state.streamingCitations,
        metadata: {
          groundingScore: state.streamingGroundingScore,
          groundingWarning: state.streamingGroundingWarning,
        },
        createdAt: new Date().toISOString(),
      };
      state.messages.push(newAssistantMsg);
      state.streamingText = '';
      state.streamingCitations = [];
    },
    openEvidenceDrawer: (state, action: PayloadAction<CitationItem>) => {
      state.activeEvidence = action.payload;
      state.isEvidenceDrawerOpen = true;
    },
    closeEvidenceDrawer: (state) => {
      state.isEvidenceDrawerOpen = false;
      state.activeEvidence = null;
    },
  },
});

export const {
  setConversations,
  setActiveConversationId,
  setMessages,
  addMessage,
  startStreaming,
  appendStreamToken,
  setStreamCitations,
  finalizeStream,
  openEvidenceDrawer,
  closeEvidenceDrawer,
} = chatSlice.actions;

export default chatSlice.reducer;
