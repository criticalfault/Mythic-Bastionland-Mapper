import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Lobby from '../components/Lobby.jsx';

vi.mock('../socket.js', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import socket from '../socket.js';

const mockUser = { displayName: 'Dean Petty', email: 'dean@test.com' };
const noop = () => {};

/** Helper: find a registered socket.on handler by event name */
function getSocketHandler(eventName) {
  const call = socket.on.mock.calls.find(([e]) => e === eventName);
  if (!call) throw new Error(`No socket.on handler registered for "${eventName}"`);
  return call[1];
}

describe('Lobby', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the signed-in user name', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    expect(screen.getByText('Dean Petty')).toBeInTheDocument();
  });

  it('requests myRooms on mount', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    expect(socket.emit).toHaveBeenCalledWith('lobby:myRooms');
  });

  it('shows My Realms tab by default', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    expect(screen.getByPlaceholderText('Realm name…')).toBeInTheDocument();
  });

  it('switches to Join Realm tab', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    fireEvent.click(screen.getByText('Join Realm'));
    expect(screen.getByPlaceholderText('ABCDEF')).toBeInTheDocument();
  });

  it('emits lobby:createRoom with realm name and password', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    fireEvent.change(screen.getByPlaceholderText('Realm name…'), { target: { value: 'The Shattered Vale' } });
    fireEvent.change(screen.getByPlaceholderText('Password (optional)…'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('+ Create Realm'));
    expect(socket.emit).toHaveBeenCalledWith('lobby:createRoom', {
      realmName: 'The Shattered Vale',
      password: 'secret',
    });
  });

  it('emits lobby:createRoom with default name if empty', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    fireEvent.click(screen.getByText('+ Create Realm'));
    expect(socket.emit).toHaveBeenCalledWith('lobby:createRoom', {
      realmName: 'New Realm',
      password: '',
    });
  });

  it('emits lobby:joinRoom with uppercased invite code', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    fireEvent.click(screen.getByText('Join Realm'));
    fireEvent.change(screen.getByPlaceholderText('ABCDEF'), { target: { value: 'ab12cd' } });
    fireEvent.click(screen.getByText('Join Realm', { selector: 'button.btn-primary' }));
    expect(socket.emit).toHaveBeenCalledWith('lobby:joinRoom', {
      inviteCode: 'AB12CD',
      password: '',
    });
  });

  it('shows error message from lobby:error event', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    act(() => {
      getSocketHandler('lobby:error')({ message: 'Incorrect password.' });
    });
    expect(screen.getByText('Incorrect password.')).toBeInTheDocument();
  });

  it('shows rooms returned from lobby:myRooms', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    act(() => {
      getSocketHandler('lobby:myRooms')([
        { roomId: 'r1', realmName: 'The Dark Vale', inviteCode: 'ABC123', hasPassword: false },
        { roomId: 'r2', realmName: 'Iron Citadel', inviteCode: 'XYZ789', hasPassword: true },
      ]);
    });
    expect(screen.getByText('The Dark Vale')).toBeInTheDocument();
    expect(screen.getByText('Iron Citadel 🔒')).toBeInTheDocument();
  });

  it('shows empty state when no rooms', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    act(() => {
      getSocketHandler('lobby:myRooms')([]);
    });
    expect(screen.getByText('No realms yet — create one above!')).toBeInTheDocument();
  });

  it('join button is disabled when code is empty', () => {
    render(<Lobby authUser={mockUser} onJoined={noop} />);
    fireEvent.click(screen.getByText('Join Realm'));
    const joinBtn = screen.getByText('Join Realm', { selector: 'button.btn-primary' });
    expect(joinBtn).toBeDisabled();
  });
});
