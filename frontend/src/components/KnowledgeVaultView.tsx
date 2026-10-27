// React hooks and Lucide icons
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FileSpreadsheet,
  FileText,
  Globe,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UploadCloud,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import {
  removeDocumentState,
  setDocumentLoading,
  setDocuments,
  setFilterQuery,
  setUploading,
  setUploadProgress,
} from '../store/slices/documentSlice.js';
import { openAuthModal, openPermissionsModal } from '../store/slices/uiSlice.js';
// API service client
import { knowraApi } from '../services/api.js';

// Knowledge vault view featuring holographic drag-and-drop ingestion and RBAC controls
// returns: React.JSX.Element
export const KnowledgeVaultView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { documents, isLoading, isUploading, uploadProgress, filterQuery } = useAppSelector(
    (state) => state.document
  );

  const [dragOver, setDragOver] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Loads documents from backend
  const loadDocuments = () => {
    if (!isAuthenticated) return;
    dispatch(setDocumentLoading(true));
    knowraApi.getDocuments()
      .then((docs) => dispatch(setDocuments(docs)))
      .catch((err) => console.error('Failed to load documents:', err))
      .finally(() => dispatch(setDocumentLoading(false)));
  };

  useEffect(() => {
    loadDocuments();
  }, [isAuthenticated]);

  // Handles file upload execution
  const handleUploadFile = async (file: File) => {
    if (!isAuthenticated) {
      dispatch(openAuthModal('login'));
      return;
    }

    dispatch(setUploading(true));
    dispatch(setUploadProgress(0));
    setUploadFeedback(null);

    try {
      const res = await knowraApi.uploadDocument(file, (percent) => {
        dispatch(setUploadProgress(percent));
      });

      setUploadFeedback(`Document "${file.name}" uploaded successfully (Status: ${res.status})`);
      // Reload documents
      loadDocuments();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadFeedback(`Upload failed: ${msg || 'Error processing file'}`);
    } finally {
      dispatch(setUploading(false));
      setTimeout(() => setUploadFeedback(null), 5000);
    }
  };

  // Handles drag drop file event
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  // Deletes document from backend
  const handleDeleteDoc = async (id: string, title: string) => {
    if (!window.confirm(`Delete document "${title}" and its vector index chunks?`)) return;
    try {
      await knowraApi.deleteDocument(id);
      dispatch(removeDocumentState(id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Delete failed: ${msg || 'Unauthorized to delete document'}`);
    }
  };

  // Filters documents by search query
  const filteredDocuments = documents.filter((d) => {
    const q = filterQuery.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q);
  });

  // Helper format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Returns icon for mime type
  const getFormatIcon = (mime: string) => {
    if (mime.includes('pdf')) return <FileText size={18} color="#ef4444" />;
    if (mime.includes('word') || mime.includes('docx')) return <FileText size={18} color="#3b82f6" />;
    if (mime.includes('csv')) return <FileSpreadsheet size={18} color="#10b981" />;
    return <FileText size={18} color="#a855f7" />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Holographic Drag-and-Drop Ingestion Hub */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="glass-panel"
        style={{
          padding: '36px 24px',
          textAlign: 'center',
          border: dragOver ? '2px dashed var(--accent-cyan)' : '2px dashed rgba(0, 242, 254, 0.25)',
          background: dragOver ? 'rgba(0, 242, 254, 0.06)' : 'rgba(12, 18, 32, 0.7)',
          transition: 'all var(--transition-fast)',
          position: 'relative',
        }}
      >
        <input
          type="file"
          id="vault-file-upload"
          accept=".pdf,.docx,.csv,.txt,.md"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUploadFile(e.target.files[0]);
            }
          }}
          style={{ display: 'none' }}
        />

        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'rgba(0, 242, 254, 0.1)',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
          boxShadow: '0 0 25px rgba(0, 242, 254, 0.2)',
        }}>
          <UploadCloud size={28} color="#00f2fe" />
        </div>

        <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '6px' }}>
          Drag & Drop Document to Ingest
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 18px', lineHeight: 1.5 }}>
          Knowra parses semantic headings, preserves tables, calculates SHA-256 deduplication hashes, and indexes dual-branch vector & tsvector candidates.
        </p>

        {/* Upload Button */}
        <label htmlFor="vault-file-upload" className="btn-primary" style={{ cursor: 'pointer' }}>
          <span>Select Document from Disk</span>
        </label>

        {/* Supported Format Pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'PDF (Page-Aware)', color: '#ef4444' },
            { label: 'DOCX (Heading Breadcrumbs)', color: '#3b82f6' },
            { label: 'CSV (Table Row Preservation)', color: '#10b981' },
            { label: 'Markdown & TXT', color: '#a855f7' },
          ].map((fmt, idx) => (
            <span
              key={idx}
              className="glass-pill"
              style={{ padding: '4px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: fmt.color, display: 'inline-block', marginRight: '6px' }} />
              {fmt.label}
            </span>
          ))}
        </div>

        {/* Real-time Upload Progress Bar */}
        {isUploading && (
          <div style={{ maxWidth: '400px', margin: '20px auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span>Uploading & Parsing...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${uploadProgress}%`,
                background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))',
                boxShadow: '0 0 10px rgba(0, 242, 254, 0.5)',
                transition: 'width 0.2s ease',
              }} />
            </div>
          </div>
        )}

        {/* Feedback Alert */}
        {uploadFeedback && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '16px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.8rem',
            background: uploadFeedback.includes('failed') ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: uploadFeedback.includes('failed') ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
            color: uploadFeedback.includes('failed') ? '#fb7185' : '#34d399',
          }}>
            {uploadFeedback.includes('failed') ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{uploadFeedback}</span>
          </div>
        )}
      </div>

      {/* 2. Knowledge Vault Filter & Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '420px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '14px', top: '13px' }} />
            <input
              type="text"
              placeholder="Search knowledge documents by title or filename..."
              value={filterQuery}
              onChange={(e) => dispatch(setFilterQuery(e.target.value))}
              className="glass-input"
              style={{ width: '100%', paddingLeft: '40px', fontSize: '0.86rem' }}
            />
          </div>
        </div>

        <button
          onClick={loadDocuments}
          disabled={isLoading}
          className="btn-ghost"
          style={{ gap: '6px', fontSize: '0.82rem' }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Vault</span>
        </button>
      </div>

      {/* 3. Document Cards Grid */}
      {filteredDocuments.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Database size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '4px' }}>
            No documents in this tenant vault
          </h4>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            Upload a PDF, DOCX, CSV, or Markdown file above to start vector indexing.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="glass-panel"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                background: 'rgba(14, 20, 36, 0.75)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {/* Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {getFormatIcon(doc.mimeType)}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.96rem', color: '#fff', fontWeight: 600 }}>
                        {doc.title}
                      </h4>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        {doc.filename}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  {/* Ingestion Status */}
                  {doc.status === 'READY' && (
                    <span className="badge badge-ready">
                      <CheckCircle2 size={11} /> READY
                    </span>
                  )}
                  {doc.status === 'PROCESSING' && (
                    <span className="badge badge-processing">
                      <Clock size={11} /> PROCESSING
                    </span>
                  )}
                  {doc.status === 'QUEUED' && (
                    <span className="badge" style={{ background: 'rgba(0, 242, 254, 0.1)', color: '#00f2fe' }}>
                      <Clock size={11} /> QUEUED
                    </span>
                  )}
                  {doc.status === 'ERROR' && (
                    <span className="badge badge-error" title={doc.errorMessage || 'Error'}>
                      <AlertCircle size={11} /> ERROR
                    </span>
                  )}

                  {/* Publicity Status */}
                  {doc.isPublicWithinTenant ? (
                    <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                      <Globe size={11} /> PUBLIC TENANT
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                      <Lock size={11} /> RESTRICTED RBAC
                    </span>
                  )}

                  <span className="glass-pill" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    {formatBytes(doc.fileSizeBytes)}
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <button
                  onClick={() => dispatch(openPermissionsModal({ docId: doc.id, title: doc.title }))}
                  className="btn-ghost"
                  style={{ gap: '6px', fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  <Shield size={14} color="#c084fc" />
                  <span>Access Control</span>
                </button>

                <button
                  onClick={() => handleDeleteDoc(doc.id, doc.title)}
                  className="btn-ghost"
                  style={{ padding: '6px', color: '#fb7185' }}
                  title="Delete Document"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
