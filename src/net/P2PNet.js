import { NetManager } from './NetManager.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randCode(len = 6) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export class P2PNet extends NetManager {
  constructor() {
    super();
    this._peer = null;
    this._conns = new Map(); // peerId → DataConnection
  }

  // ── Host: create a room with a random code as the PeerJS peer ID ──
  async createRoom() {
    const { Peer } = await import('peerjs');
    const code = randCode();
    return new Promise((resolve, reject) => {
      this._peer = new Peer(code, { debug: 0 });

      this._peer.on('open', id => {
        this.myId     = id;
        this.roomCode = id; // peer ID == room code for the host
        this.isHost   = true;
        this._peer.on('connection', conn => this._onIncomingConn(conn));
        resolve(code);
      });

      this._peer.on('error', err => {
        if (err.type === 'unavailable-id') {
          // Code taken — silently retry with a new one
          this._peer.destroy();
          this.createRoom().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // ── Client: join a room by code ──
  async joinRoom(code) {
    const { Peer } = await import('peerjs');
    return new Promise((resolve, reject) => {
      this._peer = new Peer({ debug: 0 });

      this._peer.on('open', id => {
        this.myId     = id;
        this.roomCode = code.toUpperCase(); // shared with host → deterministic map seed
        const conn = this._peer.connect(code.toUpperCase(), { reliable: true });

        conn.on('open', () => {
          this._setupConn(conn);
          resolve();
        });

        conn.on('error', reject);
      });

      this._peer.on('error', reject);
    });
  }

  // ── Incoming connection (host side) ──
  _onIncomingConn(conn) {
    conn.on('open', () => {
      this._setupConn(conn);
      // Notify Game that a new peer has joined so it can send worldState
      this._emit('newPeer', { id: conn.peer, _from: conn.peer });
    });
  }

  // ── Wire up a DataConnection ──
  _setupConn(conn) {
    this._conns.set(conn.peer, conn);

    conn.on('data', raw => {
      let msg;
      try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch { return; }

      msg._from = conn.peer;

      // Host relays to all OTHER peers
      if (this.isHost) {
        const data = JSON.stringify(msg);
        for (const [pid, c] of this._conns) {
          if (pid !== conn.peer && c.open) c.send(data);
        }
      }

      this._emit(msg.type, msg);
    });

    conn.on('close', () => {
      this._conns.delete(conn.peer);
      // Host broadcasts the departure to remaining peers
      if (this.isHost) {
        this.send({ type: 'peerLeft', id: conn.peer });
      }
      this._emit('peerLeft', { type: 'peerLeft', id: conn.peer });
    });

    conn.on('error', err => {
      console.warn('[P2PNet] connection error', err);
      this._conns.delete(conn.peer);
    });
  }

  // ── Send to all peers ──
  send(msg) {
    const data = JSON.stringify(msg);
    for (const conn of this._conns.values()) {
      if (conn.open) conn.send(data);
    }
  }

  // ── Send to one specific peer (host → new joiner worldState) ──
  sendTo(peerId, msg) {
    const conn = this._conns.get(peerId);
    if (conn && conn.open) conn.send(JSON.stringify(msg));
  }

  disconnect() {
    if (this._peer) this._peer.destroy();
  }

  get peerCount() { return this._conns.size; }
}
