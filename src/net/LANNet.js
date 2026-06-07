import { P2PNet } from './P2PNet.js';

const CHANNEL_NAME = 'testing-ground-lan';

// LAN mode: same WebRTC transport as P2PNet, but adds
// BroadcastChannel room discovery for same-device / same-browser play.
export class LANNet extends P2PNet {
  constructor() {
    super();
    this._channel  = null;
    this._roomCode = null;
    this._announceTimer = null;

    // Called with (code, peerId) when another LAN room is discovered
    this.onRoomDiscovered = null;
  }

  initLAN() {
    if (this._channel) return;
    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = ({ data }) => {
      if (data?.type === 'lanAnnounce' && data.roomCode !== this._roomCode) {
        this.onRoomDiscovered?.(data.roomCode, data.peerId);
      }
    };
  }

  async createRoom() {
    this.initLAN();
    const code = await super.createRoom();
    this._roomCode = code;

    // Announce presence every 2 s so nearby tabs can discover
    const announce = () => {
      if (!this._channel) return;
      this._channel.postMessage({ type: 'lanAnnounce', roomCode: code, peerId: this.myId });
    };
    announce();
    this._announceTimer = setInterval(announce, 2000);
    return code;
  }

  async joinRoom(code) {
    this.initLAN();
    this._roomCode = code;
    return super.joinRoom(code);
  }

  disconnect() {
    clearInterval(this._announceTimer);
    if (this._channel) { this._channel.close(); this._channel = null; }
    super.disconnect();
  }
}
