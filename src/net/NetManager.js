// Abstract network manager.  P2PNet and LANNet extend this.
export class NetManager {
  constructor() {
    this._handlers = {};
    this._queue    = [];   // messages received before handlers registered
    this.myId      = null;
    this.isHost    = false;
  }

  // Register a handler for a message type.  Replays queued messages immediately.
  on(type, handler) {
    if (!this._handlers[type]) this._handlers[type] = [];
    this._handlers[type].push(handler);

    // Drain queue for this type
    const pending = this._queue.filter(m => m.type === type);
    this._queue   = this._queue.filter(m => m.type !== type);
    for (const msg of pending) {
      try { handler(msg); } catch (e) { console.error('[NetManager] handler error', e); }
    }
    return this;
  }

  _emit(type, data) {
    const handlers = this._handlers[type];
    if (!handlers || handlers.length === 0) {
      // Buffer game-state messages until Game registers its handlers
      if (['worldState', 'playerState', 'wallHit', 'shoot', 'peerLeft', 'newMap'].includes(type)) {
        this._queue.push(data);
      }
    } else {
      for (const h of handlers) {
        try { h(data); } catch (e) { console.error('[NetManager] handler error', e); }
      }
    }
  }

  // Broadcast to all connected peers
  send(msg) {}

  // Send to one specific peer (used by host for worldState)
  sendTo(peerId, msg) {}

  disconnect() {}

  get peerCount() { return 0; }
}
