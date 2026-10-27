// Redux Toolkit slice for document knowledge vault
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DocumentItem } from '../../services/api.js';

// State interface for document knowledge vault
export interface DocumentState {
  documents: DocumentItem[];
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  filterQuery: string;
}

const initialState: DocumentState = {
  documents: [],
  isLoading: false,
  isUploading: false,
  uploadProgress: 0,
  filterQuery: '',
};

export const documentSlice = createSlice({
  name: 'document',
  initialState,
  reducers: {
    setDocuments: (state, action: PayloadAction<DocumentItem[]>) => {
      state.documents = action.payload;
    },
    setDocumentLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.isUploading = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    setFilterQuery: (state, action: PayloadAction<string>) => {
      state.filterQuery = action.payload;
    },
    removeDocumentState: (state, action: PayloadAction<string>) => {
      state.documents = state.documents.filter((d) => d.id !== action.payload);
    },
  },
});

export const {
  setDocuments,
  setDocumentLoading,
  setUploading,
  setUploadProgress,
  setFilterQuery,
  removeDocumentState,
} = documentSlice.actions;

export default documentSlice.reducer;
