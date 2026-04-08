import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ChatPanel from '../components/ChatPanel.jsx';

// Mock socket so we never need a real connection
vi.mock('../socket.js', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import socket from '../socket.js';

const mockUser = { displayName: 'Dean', email: 'dean@test.com' };

/** Helper: find a registered socket.on handler by event name */
function getSocketHandler(eventName) {
  const call = socket.on.mock.calls.find(([e]) => e === eventName);
  if (!call) throw new Error(`No socket.on handler registered for "${eventName}"`);
  return call[1];
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the toggle button', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    expect(screen.getByTitle('Chat')).toBeInTheDocument();
  });

  it('panel is closed by default', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    expect(screen.queryByText('No messages yet. Say hello!')).not.toBeInTheDocument();
  });

  it('opens panel on toggle button click', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });

  it('shows initial messages when opened', () => {
    const msgs = [
      { id: '1', senderName: 'GM', isGM: true, text: 'Welcome adventurers!', timestamp: Date.now() },
      { id: '2', senderName: 'Alice', isGM: false, text: 'Ready to explore!', timestamp: Date.now() },
    ];
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={msgs} />);
    fireEvent.click(screen.getByTitle('Chat'));
    expect(screen.getByText('Welcome adventurers!')).toBeInTheDocument();
    expect(screen.getByText('Ready to explore!')).toBeInTheDocument();
  });

  it('emits chat:send when Send is clicked', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    const input = screen.getByPlaceholderText('Say something…');
    fireEvent.change(input, { target: { value: 'Hello!' } });
    fireEvent.click(screen.getByText('Send'));
    expect(socket.emit).toHaveBeenCalledWith('chat:send', { text: 'Hello!' });
  });

  it('clears the input after sending', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    const input = screen.getByPlaceholderText('Say something…');
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Send'));
    expect(input.value).toBe('');
  });

  it('emits on Enter key press', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    const input = screen.getByPlaceholderText('Say something…');
    fireEvent.change(input, { target: { value: 'Enter message' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(socket.emit).toHaveBeenCalledWith('chat:send', { text: 'Enter message' });
  });

  it('does not emit on empty message', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    fireEvent.click(screen.getByText('Send'));
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('shows unread badge when a message arrives while closed', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    // Panel is closed — simulate incoming message via the socket.on callback
    act(() => {
      getSocketHandler('chat:message')({
        id: 'x1', senderName: 'GM', isGM: true, text: 'Hey!', timestamp: Date.now(),
      });
    });
    // Badge should appear
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('clears unread badge when panel is opened', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    act(() => {
      getSocketHandler('chat:message')({
        id: 'x1', senderName: 'GM', isGM: true, text: 'Hey!', timestamp: Date.now(),
      });
    });
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Chat')); // open
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('closes panel when ✕ is clicked', () => {
    render(<ChatPanel authUser={mockUser} isGM={false} initialMessages={[]} />);
    fireEvent.click(screen.getByTitle('Chat'));
    expect(screen.getByPlaceholderText('Say something…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByPlaceholderText('Say something…')).not.toBeInTheDocument();
  });
});
