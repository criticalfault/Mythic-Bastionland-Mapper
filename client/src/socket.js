import { io } from 'socket.io-client';
import { auth } from './firebase.js';

let _socket = null;

export async function createSocket() {
  // Get fresh Firebase ID token if user is signed in
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken(/* forceRefresh */ false) : '';

  _socket = io({
    auth: { idToken },
    autoConnect: true,
  });

  return _socket;
}

export function getSocket() {
  return _socket;
}

// Named export used by components that import socket directly
export default {
  get current() { return _socket; },
  emit(...args) { _socket?.emit(...args); },
  on(...args) { _socket?.on(...args); },
  off(...args) { _socket?.off(...args); },
  removeAllListeners(...args) { _socket?.removeAllListeners(...args); },
};
