import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

export default function ChatPanel({ authUser, isGM, initialMessages = [] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // null = CSS default (bottom-right)
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null); // { startMX, startMY, startPX, startPY }

  useEffect(() => {
    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (!open) setUnread(u => u + 1);
    });
    return () => socket.off('chat:message');
  }, [open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = (e) => {
    if (e.button !== 0) return; // left-click only
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startPX: rect.left, startPY: rect.top };
    e.preventDefault(); // stop text selection

    const onMove = (e) => {
      const { startMX, startMY, startPX, startPY } = dragRef.current;
      const newX = startPX + (e.clientX - startMX);
      const newY = startPY + (e.clientY - startMY);
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - w, newX)),
        y: Math.max(0, Math.min(window.innerHeight - h, newY)),
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('chat:send', { text: trimmed });
    setText('');
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const panelStyle = pos
    ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : {};

  return (
    <>
      {/* Floating toggle button */}
      <button
        className={`chat-toggle-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Chat"
      >
        💬
        {unread > 0 && <span className="chat-unread-badge">{unread}</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel" style={panelStyle} ref={panelRef}>
          <div
            className="chat-panel-head"
            onMouseDown={onHeaderMouseDown}
            style={{ cursor: 'grab' }}
          >
            <span className="chat-panel-title">💬 Chat</span>
            <button
              className="dice-close"
              onMouseDown={e => e.stopPropagation()} // don't start drag on close click
              onClick={() => setOpen(false)}
            >✕</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">No messages yet. Say hello!</p>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`chat-msg${msg.isGM ? ' chat-msg-gm' : ''}`}>
                <div className="chat-msg-header">
                  <span className={`chat-msg-name${msg.isGM ? ' chat-msg-name-gm' : ''}`}>
                    {msg.isGM ? '⚔ ' : ''}{msg.senderName}
                  </span>
                  <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="chat-msg-text">{msg.text}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="text-input chat-input"
              placeholder="Say something…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              maxLength={300}
            />
            <button className="btn-primary chat-send-btn" onClick={handleSend} disabled={!text.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
