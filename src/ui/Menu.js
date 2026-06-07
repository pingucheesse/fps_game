import { P2PNet } from '../net/P2PNet.js';
import { LANNet } from '../net/LANNet.js';

export class Menu {
  constructor() {
    this._cb  = null;
    this._net = null;
    this._settings = { sensitivity: 5, fov: 90 };
    this._bindUI();
  }

  onStartGame(cb) { this._cb = cb; }

  // ── Bind all UI events ──
  _bindUI() {
    const $ = id => document.getElementById(id);

    // Main buttons
    $('btn-singleplayer').onclick = () => this._startSingle();
    $('btn-p2p').onclick  = () => this._showPanel('p2p-panel');
    $('btn-lan').onclick  = () => this._showPanel('lan-panel');

    // P2P panel
    $('btn-p2p-create').onclick   = () => this._p2pCreate();
    $('btn-p2p-join-mode').onclick = () => this._p2pJoinMode();
    $('btn-p2p-connect').onclick  = () => this._p2pJoin();
    $('btn-start-p2p').onclick    = () => this._launch();
    $('btn-back-p2p').onclick     = () => this._showPanel(null);

    // LAN panel
    $('btn-lan-create').onclick    = () => this._lanCreate();
    $('btn-lan-join-mode').onclick = () => this._lanJoinMode();
    $('btn-lan-connect').onclick   = () => this._lanJoin();
    $('btn-start-lan').onclick     = () => this._launch();
    $('btn-back-lan').onclick      = () => { this._cleanupNet(); this._showPanel(null); };

    // Settings sliders
    const sensSlider = $('sens-slider');
    const fovSlider  = $('fov-slider');
    sensSlider.oninput = e => {
      this._settings.sensitivity = +e.target.value;
      $('sens-val').textContent = e.target.value;
    };
    fovSlider.oninput = e => {
      this._settings.fov = +e.target.value;
      $('fov-val').textContent = e.target.value;
    };
  }

  // ── Panel visibility ──
  _showPanel(id) {
    ['p2p-panel', 'lan-panel'].forEach(p => {
      document.getElementById(p).classList.remove('visible');
    });
    if (id) document.getElementById(id).classList.add('visible');
    this._setStatus('');
    this._setStatus('', 'lan-status');
  }

  _setStatus(msg, elId = 'status') {
    const el = document.getElementById(elId);
    if (el) el.textContent = msg;
  }

  _show(id, visible = true) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  // ── Singleplayer ──
  _startSingle() {
    this._hide();
    this._cb(null, { ...this._settings });
  }

  // ── P2P: Create ──
  async _p2pCreate() {
    this._setStatus('Connecting…');
    this._cleanupNet();
    this._net = new P2PNet();

    try {
      const code = await this._net.createRoom();
      const display = document.getElementById('room-display');
      display.textContent = code;
      this._show('room-display');
      this._setStatus('Share this code with a friend. Waiting for players…');
      this._show('btn-start-p2p');

      this._net.on('newPeer', () => {
        this._setStatus(`Player joined! (${this._net.peerCount + 1} total)  Click Start Game when ready.`);
      });
    } catch (e) {
      this._setStatus('Error: ' + (e.message || e.type || 'connection failed'));
    }
  }

  // ── P2P: Join ──
  _p2pJoinMode() {
    this._show('room-display', false);
    this._show('p2p-code-input');
    this._show('btn-p2p-connect');
    this._setStatus('Enter the room code and click Connect');
  }

  async _p2pJoin() {
    const code = document.getElementById('p2p-code-input').value.trim().toUpperCase();
    if (!code) return;
    this._setStatus('Connecting…');
    this._cleanupNet();
    this._net = new P2PNet();
    try {
      await this._net.joinRoom(code);
      this._setStatus('Connected! Starting…');
      setTimeout(() => this._launch(), 800);
    } catch (e) {
      this._setStatus('Failed: ' + (e.message || e.type || 'unknown error'));
    }
  }

  // ── LAN: Create ──
  async _lanCreate() {
    this._setStatus('Starting LAN room…', 'lan-status');
    this._cleanupNet();
    this._net = new LANNet();

    try {
      const code = await this._net.createRoom();
      const display = document.getElementById('lan-room-display');
      display.textContent = code;
      this._show('lan-room-display');
      this._setStatus(`Room created. Share code ${code} or others on this device will see it automatically.`, 'lan-status');
      this._show('btn-start-lan');

      this._net.on('newPeer', () => {
        this._setStatus(`Player joined! (${this._net.peerCount + 1} total)`, 'lan-status');
      });
    } catch (e) {
      this._setStatus('Error: ' + (e.message || e.type), 'lan-status');
    }
  }

  // ── LAN: Join ──
  _lanJoinMode() {
    this._cleanupNet();
    this._net = new LANNet();
    this._net.onRoomDiscovered = (code) => this._addLanRoom(code);
    this._net.initLAN();

    this._show('lan-code-input');
    this._show('btn-lan-connect');
    this._setStatus('Scanning… or enter a code manually', 'lan-status');
  }

  _addLanRoom(code) {
    const list = document.getElementById('lan-rooms');
    if (list.querySelector(`[data-code="${code}"]`)) return;
    const li = document.createElement('li');
    li.textContent = `Room: ${code}`;
    li.setAttribute('data-code', code);
    li.onclick = () => { document.getElementById('lan-code-input').value = code; };
    list.appendChild(li);
  }

  async _lanJoin() {
    const code = document.getElementById('lan-code-input').value.trim().toUpperCase();
    if (!code) return;
    this._setStatus('Connecting…', 'lan-status');

    // Reuse existing LANNet instance (it has BroadcastChannel open)
    if (!this._net || !(this._net instanceof LANNet)) {
      this._net = new LANNet();
      this._net.initLAN();
    }

    try {
      await this._net.joinRoom(code);
      this._setStatus('Connected!', 'lan-status');
      setTimeout(() => this._launch(), 800);
    } catch (e) {
      this._setStatus('Failed: ' + (e.message || e.type), 'lan-status');
    }
  }

  // ── Launch the game ──
  _launch() {
    this._hide();
    this._cb(this._net, { ...this._settings });
    this._net = null; // Game owns it now
  }

  _hide() { document.getElementById('menu').style.display = 'none'; }

  _cleanupNet() {
    if (this._net) { this._net.disconnect(); this._net = null; }
  }
}
