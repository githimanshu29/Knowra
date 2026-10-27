// React hooks and Lucide icons
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Lock,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { closePermissionsModal } from '../store/slices/uiSlice.js';
// API service client
import { knowraApi } from '../services/api.js';

// Document permission entry shape
interface PermissionEntry {
  id: string;
  documentId: string;
  roleId: string | null;
  userId: string | null;
  permissionLevel: string;
  createdAt: string;
}

// Access control and permission management modal for document ACL boundaries
// returns: React.JSX.Element | null
export const PermissionsModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isPermissionsModalOpen, permissionDocId, permissionDocTitle } = useAppSelector((state) => state.ui);

  const [isPublic, setIsPublic] = useState(false);
  const [permissionsList, setPermissionsList] = useState<PermissionEntry[]>([]);
  const [roleIdInput, setRoleIdInput] = useState('');
  const [userIdInput, setUserIdInput] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'write' | 'admin'>('read');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Loads document detail and permissions list when modal opens
  useEffect(() => {
    if (isPermissionsModalOpen && permissionDocId) {
      setIsLoading(true);
      knowraApi.getDocument(permissionDocId)
        .then((data) => {
          setIsPublic(Boolean(data.document?.isPublicWithinTenant));
          setPermissionsList(data.permissions || []);
        })
        .catch((err) => {
          console.error('Failed to load document details:', err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isPermissionsModalOpen, permissionDocId]);

  if (!isPermissionsModalOpen || !permissionDocId) return null;

  // Toggles document-level public status within the tenant
  const handleTogglePublic = async () => {
    const nextPublic = !isPublic;
    setIsLoading(true);
    setFeedback(null);
    try {
      await knowraApi.updateAccessLevel(permissionDocId, nextPublic);
      setIsPublic(nextPublic);
      setFeedback({ type: 'success', message: `Document visibility updated to ${nextPublic ? 'Public in Tenant' : 'Restricted RBAC'}` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFeedback({ type: 'error', message: msg || 'Failed to update visibility level' });
    } finally {
      setIsLoading(false);
    }
  };

  // Grants permission to a role or user
  const handleAddPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleIdInput.trim() && !userIdInput.trim()) {
      setFeedback({ type: 'error', message: 'Please specify either a Role ID or a User ID' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      await knowraApi.addPermission(
        permissionDocId,
        roleIdInput.trim() || undefined,
        userIdInput.trim() || undefined,
        permissionLevel
      );
      setFeedback({ type: 'success', message: 'Permission grant registered successfully' });
      setRoleIdInput('');
      setUserIdInput('');

      // Refresh permissions list
      const updated = await knowraApi.getDocument(permissionDocId);
      setPermissionsList(updated.permissions || []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFeedback({ type: 'error', message: msg || 'Permission grant failed. Verify UUID belongs to tenant.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Revokes a permission entry
  const handleDeletePermission = async (permId: string) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      await knowraApi.deletePermission(permissionDocId, permId);
      setPermissionsList(permissionsList.filter((p) => p.id !== permId));
      setFeedback({ type: 'success', message: 'Permission revoked' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFeedback({ type: 'error', message: msg || 'Failed to revoke permission' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(4, 7, 14, 0.75)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '560px',
        background: 'rgba(12, 18, 32, 0.92)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.15)',
        padding: '30px',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Close Button */}
        <button
          onClick={() => dispatch(closePermissionsModal())}
          className="btn-ghost"
          style={{ position: 'absolute', top: '20px', right: '20px', padding: '6px', borderRadius: '50%' }}
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Shield size={22} color="#c084fc" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 700 }}>
              Access Control & RBAC Boundaries
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              {permissionDocTitle || 'Document Permission Management'}
            </p>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            marginBottom: '18px',
            background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
            border: feedback.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
            color: feedback.type === 'success' ? '#34d399' : '#fb7185',
          }}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* 1. Tenant Publicity Toggle */}
        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isPublic ? <Globe size={18} color="#00f2fe" /> : <Lock size={18} color="#f59e0b" />}
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                  {isPublic ? 'Public within Tenant' : 'Restricted (Role-Based Access Only)'}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                  {isPublic
                    ? 'All authenticated users in this tenant can retrieve chunks from this document.'
                    : 'Only explicit document owners and granted role IDs can retrieve chunks.'}
                </div>
              </div>
            </div>

            <button
              onClick={handleTogglePublic}
              disabled={isLoading}
              className={isPublic ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              {isPublic ? 'Make Restricted' : 'Make Public'}
            </button>
          </div>
        </div>

        {/* 2. Grant New Permission Form */}
        <form onSubmit={handleAddPermission} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            GRANT ROLE OR USER PERMISSION
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                ROLE UUID
              </label>
              <input
                type="text"
                placeholder="Role UUID (e.g. 11111111-...)"
                value={roleIdInput}
                onChange={(e) => setRoleIdInput(e.target.value)}
                className="glass-input font-mono"
                style={{ width: '100%', fontSize: '0.8rem', padding: '10px 12px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                OR USER UUID
              </label>
              <input
                type="text"
                placeholder="User UUID"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                className="glass-input font-mono"
                style={{ width: '100%', fontSize: '0.8rem', padding: '10px 12px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              value={permissionLevel}
              onChange={(e) => setPermissionLevel(e.target.value as 'read' | 'write' | 'admin')}
              className="glass-input"
              style={{ flex: 1, padding: '10px 12px', fontSize: '0.84rem' }}
            >
              <option value="read" style={{ background: '#0a0f1a' }}>Read Access (RAG Retrieval)</option>
              <option value="write" style={{ background: '#0a0f1a' }}>Write Access (Re-upload)</option>
              <option value="admin" style={{ background: '#0a0f1a' }}>Admin Access (Delete & Share)</option>
            </select>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary"
              style={{ padding: '10px 16px', fontSize: '0.84rem' }}
            >
              <UserPlus size={15} />
              <span>Grant</span>
            </button>
          </div>
        </form>

        {/* 3. Existing Permissions List */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', marginBottom: '8px' }}>
            ACTIVE PERMISSION GRANTS ({permissionsList.length})
          </div>

          {permissionsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              No custom role or user permissions granted yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {permissionsList.map((perm) => (
                <div
                  key={perm.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>
                      {perm.roleId ? `ROLE: ${perm.roleId}` : `USER: ${perm.userId}`}
                    </div>
                    <span className="badge badge-grounded" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                      {perm.permissionLevel}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeletePermission(perm.id)}
                    className="btn-ghost"
                    style={{ padding: '6px', borderRadius: '50%', color: '#fb7185' }}
                    title="Revoke Permission"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
