// React hooks and Lucide icons
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
// Redux typed hooks and slice actions
import { useAppDispatch, useAppSelector } from '../store/index.js';
import {
  addMessage,
  appendStreamToken,
  finalizeStream,
  openEvidenceDrawer,
  setActiveConversationId,
  setConversations,
  setMessages,
  setStreamCitations,
  startStreaming,
} from '../store/slices/chatSlice.js';
import { openAuthModal } from '../store/slices/uiSlice.js';
// API service client
import { knowraApi } from '../services/api.js';

// Neural RAG investigation canvas with multi-turn sidebar, token streaming, and citation chips
// returns: React.JSX.Element
export const NeuralChatView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    streamingText,
    streamingCitations,
  } = useAppSelector((state) => state.chat);

  const [inputQuery, setInputQuery] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scrolls message canvas to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Loads conversation list on mount or auth change
  useEffect(() => {
    if (isAuthenticated) {
      knowraApi.getConversations()
        .then((convs) => dispatch(setConversations(convs)))
        .catch((err) => console.error('Failed to load conversations:', err));
    }
  }, [isAuthenticated, dispatch]);

  // Selects an existing conversation and loads messages
  const handleSelectConversation = async (convId: string) => {
    dispatch(setActiveConversationId(convId));
    try {
      const data = await knowraApi.getConversation(convId);
      dispatch(setMessages(data.messages || []));
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    }
  };

  // Creates a new clean conversation session
  const handleNewInvestigation = () => {
    dispatch(setActiveConversationId(null));
    dispatch(setMessages([]));
  };

  // Deletes a conversation
  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await knowraApi.deleteConversation(convId);
      dispatch(setConversations(conversations.filter((c) => c.id !== convId)));
      if (activeConversationId === convId) {
        handleNewInvestigation();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Dispatches query to RAG pipeline via streaming or sync call
  const handleSendQuery = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || isSubmitting || isStreaming) return;

    if (!isAuthenticated) {
      dispatch(openAuthModal('login'));
      return;
    }

    setInputQuery('');
    setIsSubmitting(true);

    const userMessageId = `user-${Date.now()}`;
    dispatch(
      addMessage({
        id: userMessageId,
        conversationId: activeConversationId || '',
        role: 'user',
        content: textToSend,
        createdAt: new Date().toISOString(),
      })
    );

    if (useStreaming) {
      // Stream tokens via Server-Sent Events
      dispatch(startStreaming());

      try {
        await knowraApi.streamQuery(textToSend, activeConversationId || undefined, {
          onToken: (token) => {
            dispatch(appendStreamToken(token));
          },
          onCitations: (citations, score, _isGrounded, warning) => {
            dispatch(setStreamCitations({ citations, groundingScore: score, warning }));
          },
          onDone: (newConvId) => {
            dispatch(finalizeStream({ id: `asst-${Date.now()}`, conversationId: newConvId }));
            if (!activeConversationId && newConvId) {
              dispatch(setActiveConversationId(newConvId));
              knowraApi.getConversations().then((c) => dispatch(setConversations(c)));
            }
            setIsSubmitting(false);
          },
          onError: (errMsg) => {
            dispatch(appendStreamToken(`\n\n[Error: ${errMsg}]`));
            dispatch(finalizeStream({ id: `asst-${Date.now()}`, conversationId: activeConversationId || '' }));
            setIsSubmitting(false);
          },
        });
      } catch (err: unknown) {
        console.error('Streaming request failed:', err);
        dispatch(appendStreamToken('\n\n[Network connection error occurred]'));
        dispatch(finalizeStream({ id: `asst-${Date.now()}`, conversationId: activeConversationId || '' }));
        setIsSubmitting(false);
      }
    } else {
      // Synchronous JSON response
      try {
        const response = await knowraApi.querySync(textToSend, activeConversationId || undefined);
        dispatch(
          addMessage({
            id: `asst-${Date.now()}`,
            conversationId: response.conversationId,
            role: 'assistant',
            content: response.answer,
            citations: response.citations,
            metadata: {
              groundingScore: response.groundingScore,
              groundingWarning: response.groundingWarning,
            },
            createdAt: new Date().toISOString(),
          })
        );
        if (!activeConversationId && response.conversationId) {
          dispatch(setActiveConversationId(response.conversationId));
          knowraApi.getConversations().then((c) => dispatch(setConversations(c)));
        }
      } catch (err: unknown) {
        console.error('Sync query failed:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gap: '20px',
      height: 'calc(100vh - 120px)',
    }}>
      {/* 1. Multi-Turn Investigation Sidebar */}
      <aside className="glass-panel" style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        overflow: 'hidden',
        background: 'rgba(12, 17, 30, 0.75)',
      }}>
        <button
          onClick={handleNewInvestigation}
          className="btn-primary"
          style={{ width: '100%', marginBottom: '16px', padding: '10px 14px', fontSize: '0.84rem' }}
        >
          <Plus size={16} />
          <span>New Investigation</span>
        </button>

        <div style={{
          fontSize: '0.72rem',
          color: 'var(--text-tertiary)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          marginBottom: '8px',
          paddingLeft: '6px',
        }}>
          RECENT INVESTIGATIONS
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {conversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              No previous chat history found. Start a new grounded inquiry.
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    border: isSelected ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent',
                    color: isSelected ? '#f8fafc' : 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <MessageSquare size={14} color={isSelected ? '#00f2fe' : 'var(--text-tertiary)'} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {conv.title || 'Untitled Session'}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    className="btn-ghost"
                    style={{ padding: '4px', border: 'none', background: 'transparent', opacity: 0.6 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. Main Neural Interaction Canvas */}
      <section className="glass-panel" style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(10, 15, 28, 0.7)',
      }}>
        {/* Messages Scroll Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {messages.length === 0 && !isStreaming ? (
            /* Empty State: Holographic Welcome & Preset Prompts */
            <div style={{
              margin: 'auto',
              maxWidth: '620px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(168, 85, 247, 0.2))',
                border: '1px solid rgba(0, 242, 254, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(0, 242, 254, 0.3)',
                marginBottom: '18px',
              }}>
                <Sparkles size={30} color="#00f2fe" />
              </div>

              <h2 style={{ fontSize: '1.6rem', color: '#fff', marginBottom: '8px' }}>
                Enterprise Knowledge Intelligence Studio
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.6 }}>
                Ask anything grounded in enterprise truth. Knowra retrieves chunks with dual-branch hybrid search, expands to parent context, and verifies numbers before answering.
              </p>

              {/* Quick Query Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', width: '100%' }}>
                {[
                  { title: 'Remote Work Policy', query: 'What is our company general policy on remote work?' },
                  { title: 'Kubernetes Infrastructure', query: 'How does our Kubernetes production cluster deploy with ArgoCD?' },
                  { title: 'Executive Payroll Guidelines', query: 'What is the quarterly bonus structure for executive compensation?' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendQuery(item.query)}
                    className="glass-panel"
                    style={{
                      padding: '14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: '1px solid var(--border-subtle)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Zap size={14} color="#00f2fe" />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                        {item.title}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                      {item.query}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Rendered Messages */
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: '6px',
                  }}
                >
                  {/* Sender Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {msg.role === 'user' ? (
                      <>
                        <span>YOU</span>
                        <User size={13} color="#00f2fe" />
                      </>
                    ) : (
                      <>
                        <Bot size={14} color="#a855f7" />
                        <span>KNOWRA INTELLIGENCE</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble Card */}
                  <div
                    className="glass-panel"
                    style={{
                      maxWidth: '82%',
                      padding: '16px 20px',
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(79, 172, 254, 0.08))'
                        : 'rgba(16, 23, 40, 0.75)',
                      border: msg.role === 'user'
                        ? '1px solid rgba(0, 242, 254, 0.3)'
                        : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      fontSize: '0.92rem',
                      lineHeight: 1.6,
                      color: '#f8fafc',
                    }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                    {/* Citations and Grounding HUD for Assistant */}
                    {msg.role === 'assistant' && (
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                        {/* Grounding Status Indicator */}
                        {msg.metadata && typeof msg.metadata.groundingScore === 'number' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            {msg.metadata.groundingScore >= 0.6 ? (
                              <span className="badge badge-grounded">
                                <CheckCircle2 size={12} />
                                {Math.round(msg.metadata.groundingScore * 100)}% Verified Grounded
                              </span>
                            ) : (
                              <span className="badge badge-warning">
                                <AlertTriangle size={12} />
                                Grounding Warning: Unverified Claims
                              </span>
                            )}
                          </div>
                        )}

                        {/* Clickable Citation Badges */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {msg.citations.map((c, cIdx) => (
                              <button
                                key={cIdx}
                                onClick={() => dispatch(openEvidenceDrawer(c))}
                                className="glass-pill"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 10px',
                                  fontSize: '0.74rem',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  background: 'rgba(56, 189, 248, 0.08)',
                                  cursor: 'pointer',
                                  transition: 'all var(--transition-fast)',
                                }}
                              >
                                <ExternalLink size={12} />
                                <span>[{cIdx + 1}] {c.documentTitle || 'Source Doc'}</span>
                                {c.pageNumber && <span style={{ opacity: 0.7 }}>p.{c.pageNumber}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Live Streaming Assistant Message */}
              {isStreaming && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    <Bot size={14} color="#a855f7" />
                    <span>KNOWRA INTELLIGENCE (STREAMING)</span>
                  </div>

                  <div className="glass-panel" style={{
                    maxWidth: '82%',
                    padding: '16px 20px',
                    background: 'rgba(16, 23, 40, 0.75)',
                    border: '1px solid rgba(0, 242, 254, 0.35)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: '0.92rem',
                    lineHeight: 1.6,
                    color: '#f8fafc',
                  }}>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{streamingText}</span>
                    <span className="typing-cursor" />

                    {streamingCitations.length > 0 && (
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {streamingCitations.map((c, idx) => (
                          <button
                            key={idx}
                            onClick={() => dispatch(openEvidenceDrawer(c))}
                            className="glass-pill"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              fontSize: '0.74rem',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              cursor: 'pointer',
                            }}
                          >
                            <ExternalLink size={12} />
                            <span>[{idx + 1}] {c.documentTitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 3. Floating Spatial Holographic Query Bar */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(7, 11, 20, 0.85)',
          backdropFilter: 'blur(16px)',
        }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <button
              type="button"
              onClick={() => setUseStreaming(!useStreaming)}
              className="glass-pill"
              title={useStreaming ? 'Streaming mode active: word-by-word real-time output' : 'Synchronous mode: complete answer returned together'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                fontSize: '0.76rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                background: useStreaming
                  ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.18), rgba(168, 85, 247, 0.18))'
                  : 'rgba(255, 255, 255, 0.03)',
                borderColor: useStreaming ? 'rgba(0, 242, 254, 0.55)' : 'rgba(255, 255, 255, 0.08)',
                color: useStreaming ? '#00f2fe' : 'var(--text-tertiary)',
                boxShadow: useStreaming ? '0 0 16px rgba(0, 242, 254, 0.3)' : 'none',
              }}
            >
              <Zap
                size={14}
                color={useStreaming ? '#00f2fe' : 'var(--text-tertiary)'}
                fill={useStreaming ? '#00f2fe' : 'none'}
              />
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: useStreaming ? '#00f2fe' : 'rgba(255, 255, 255, 0.3)',
                  boxShadow: useStreaming ? '0 0 8px #00f2fe' : 'none',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 600 }}>
                {useStreaming ? 'Stream: ON (SSE)' : 'Stream: OFF (Sync)'}
              </span>
            </button>

            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask anything grounded in internal documents (e.g. Leave policy, cluster specs)..."
              disabled={isSubmitting || isStreaming}
              className="glass-input"
              style={{ flex: 1, padding: '12px 18px', fontSize: '0.9rem' }}
            />

            <button
              type="submit"
              disabled={!inputQuery.trim() || isSubmitting || isStreaming}
              className="btn-primary"
              style={{ padding: '12px 20px', borderRadius: 'var(--radius-md)' }}
            >
              <Send size={16} />
              <span>Investigate</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
