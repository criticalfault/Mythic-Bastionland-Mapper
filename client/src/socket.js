import { io } from 'socket.io-client';

const params = new URLSearchParams(window.location.search);
const gmToken = params.get('gm') || '';
const roomId = params.get('room') || '';

const socket = io({
  auth: { gmToken, roomId },
  autoConnect: true,
});

export default socket;
export { gmToken, roomId };
