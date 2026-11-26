// --- BARAJA ESPAÑOLA Y JERARQUÍA DE TRUCO ---
const SUITS = [
  {
    id: 'espada',
    label: 'Espada',
    icon: `<svg viewBox="0 0 64 64" width="34" height="34"><path fill="#4a6b82" d="M54 6L24 36l4 4L58 10z"/><path fill="#b89b5e" d="M16 32l16 16-4 4-16-16z"/><path fill="#5c3a21" d="M10 46l8 8-6 6-8-8z"/></svg>`
  },
  {
    id: 'basto',
    label: 'Basto',
    icon: `<svg viewBox="0 0 64 64" width="34" height="34"><path fill="#6e472b" d="M46 8c4 0 8 4 8 8 0 6-26 36-34 40-4 2-10-4-8-8 4-8 34-40 34-40z"/><circle cx="38" cy="22" r="2.5" fill="#3d2514"/><circle cx="28" cy="34" r="2.5" fill="#3d2514"/></svg>`
  },
  {
    id: 'oro',
    label: 'Oro',
    icon: `<svg viewBox="0 0 64 64" width="34" height="34"><circle cx="32" cy="32" r="22" fill="#e6b800" stroke="#997300" stroke-width="4"/><circle cx="32" cy="32" r="14" fill="none" stroke="#fff099" stroke-width="2"/></svg>`
  },
  {
    id: 'copa',
    label: 'Copa',
    icon: `<svg viewBox="0 0 64 64" width="34" height="34"><path fill="#c0392b" d="M16 10h32v14c0 10-7 16-16 16s-16-6-16-16V10z"/><rect x="29" y="38" width="6" height="14" fill="#d4af37"/><rect x="20" y="50" width="24" height="6" rx="2" fill="#d4af37"/></svg>`
  }
];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function getTrucoPower(card) {
  const { num, suit } = card;
  if (num === 1 && suit === 'espada') return 14;
  if (num === 1 && suit === 'basto') return 13;
  if (num === 7 && suit === 'espada') return 12;
  if (num === 7 && suit === 'oro') return 11;
  if (num === 3) return 10;
  if (num === 2) return 9;
  if (num === 1) return 8;
  if (num === 12) return 7;
  if (num === 11) return 6;
  if (num === 10) return 5;
  if (num === 7) return 4;
  if (num === 6) return 3;
  if (num === 5) return 2;
  return 1; // 4
}

function getEnvidoValue(card) {
  return card.num >= 10 ? 0 : card.num;
}

function calculateEnvido(hand) {
  let max = 0;
  for (let i = 0; i < hand.length; i++) {
    max = Math.max(max, getEnvidoValue(hand[i]));
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].suit === hand[j].suit) {
        max = Math.max(max, 20 + getEnvidoValue(hand[i]) + getEnvidoValue(hand[j]));
      }
    }
  }
  return max;
}

function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const n of NUMBERS) {
      deck.push({ num: n, suit: s.id, icon: s.icon, label: `${n} de ${s.label}` });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// --- ESTADO DE RED Y PARTIDA ---
let peer = null;
let isHost = false;
let myId = null;
let myName = '';
let connections = [];
let hostConn = null;

let state = {
  started: false,
  mode: 2,
  targetScore: 30,
  players: [],
  scores: [0, 0],
  dealerIdx: 0,
  turnIdx: 0,
  roundTrick: 0,
  trickWinners: [],
  currentPlays: [],
  trucoLevel: 1,
  trucoOwnerTeam: null,
  pendingCall: null,
  envidoDone: false,
  envidoChain: [],
  logs: []
};

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('sala')) {
  document.getElementById('join-code').value = urlParams.get('sala');
}

// --- INICIALIZACIÓN DE PEERJS ---
document.getElementById('btn-create').onclick = () => {
  myName = document.getElementById('player-name').value.trim() || 'DM / Tabernero';
  state.mode = parseInt(document.getElementById('game-mode').value);
  state.targetScore = parseInt(document.getElementById('max-points').value);
  isHost = true;

  const shortCode = 'dnd-' + Math.random().toString(36).substring(2, 7);
  peer = new Peer(shortCode);

  peer.on('open', (id) => {
    myId = id;
    state.players.push({ id, name: myName, team: 0, hand: [], played: [] });
    showWaitingRoom(id);
  });

  peer.on('connection', (conn) => {
    conn.on('data', (msg) => handleClientMessage(conn, msg));
    conn.on('close', () => {
      connections = connections.filter((c) => c !== conn);
    });
  });
};

document.getElementById('btn-join').onclick = () => {
  myName = document.getElementById('player-name').value.trim() || 'Aventurero';
  const roomId = document.getElementById('join-code').value.trim();
  if (!roomId) return alert('Ingresá el código de sala.');

  peer = new Peer();
  peer.on('open', (id) => {
    myId = id;
    hostConn = peer.connect(roomId);
    hostConn.on('open', () => {
      hostConn.send({ type: 'JOIN', id: myId, name: myName });
      showWaitingRoom(roomId);
    });
    hostConn.on('data', (msg) => {
      if (msg.type === 'STATE') {
        state = msg.state;
        render();
      }
    });
  });
};

document.getElementById('btn-copy').onclick = () => {
  const input = document.getElementById('share-link');
  input.select();
  navigator.clipboard.writeText(input.value);
  document.getElementById('btn-copy').textContent = '¡Copiado!';
};

document.getElementById('btn-start').onclick = () => {
  if (isHost && state.players.length === state.mode) {
    state.started = true;
    addLog('¡Comienza la partida en la taberna!');
    startNewHand();
  }
};

function showWaitingRoom(roomId) {
  document.getElementById('lobby-setup').classList.add('hidden');
  document.getElementById('waiting-room').classList.remove('hidden');
  const badge = document.getElementById('room-badge');
  badge.textContent = `Sala: ${roomId}`;
  badge.classList.remove('hidden');

  const url = `${window.location.origin}${window.location.pathname}?sala=${roomId}`;
  document.getElementById('share-link').value = url;
  renderWaitingList();
}

function renderWaitingList() {
  const list = document.getElementById('player-list');
  list.innerHTML = state.players
    .map((p, i) => `<li>Jugador ${i + 1}: <strong>${p.name}</strong> (Equipo ${p.team === 0 ? 'A' : 'B'})</li>`)
    .join('');

  if (isHost && state.players.length === state.mode) {
    document.getElementById('btn-start').classList.remove('hidden');
  }
}

// --- LÓGICA DEL SERVIDOR (HOST) ---
function handleClientMessage(conn, msg) {
  if (msg.type === 'JOIN') {
    if (state.players.length >= state.mode) return;
    connections.push(conn);
    const team = state.players.length % 2;
    state.players.push({ id: msg.id, name: msg.name, team, hand: [], played: [] });
    broadcastState();
  } else if (msg.type === 'ACTION') {
    processAction(msg.playerId, msg.action);
  }
}

function sendAction(action) {
  if (isHost) {
    processAction(myId, action);
  } else if (hostConn) {
    hostConn.send({ type: 'ACTION', playerId: myId, action });
  }
}

function sendDndAction(desc) {
  sendAction({ kind: 'DND_LOG', desc });
}

function broadcastState() {
  render();
  for (const conn of connections) {
    conn.send({ type: 'STATE', state });
  }
}

function addLog(text) {
  state.logs.unshift(text);
  if (state.logs.length > 35) state.logs.pop();
}

// --- MOTOR DE REGLAS DEL TRUCO ---
function startNewHand() {
  if (state.scores[0] >= state.targetScore || state.scores[1] >= state.targetScore) {
    const winTeam = state.scores[0] >= state.targetScore ? 'Equipo A' : 'Equipo B';
    addLog(`🏆 ¡${winTeam} gana la partida!`);
    broadcastState();
    return;
  }

  const deck = buildDeck();
  state.players.forEach((p) => {
    p.hand = [deck.pop(), deck.pop(), deck.pop()];
    p.played = [];
  });

  state.dealerIdx = (state.dealerIdx + 1) % state.mode;
  state.turnIdx = (state.dealerIdx + 1) % state.mode;
  state.roundTrick = 0;
  state.trickWinners = [];
  state.currentPlays = [];
  state.trucoLevel = 1;
  state.trucoOwnerTeam = null;
  state.pendingCall = null;
  state.envidoDone = false;
  state.envidoChain = [];

  addLog(`--- Nueva mano (Mano: ${state.players[state.turnIdx].name}) ---`);
  broadcastState();
}

function processAction(playerId, action) {
  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx === -1) return;
  const player = state.players[pIdx];

  if (action.kind === 'DND_LOG') {
    addLog(`🎲 ${player.name} realiza: ${action.desc}`);
    broadcastState();
    return;
  }

  if (state.pendingCall) {
    if (player.team === state.pendingCall.fromTeam) return;

    if (action.kind === 'ACCEPT') {
      if (state.pendingCall.type === 'truco') {
        state.trucoLevel = state.pendingCall.nextLevel;
        state.trucoOwnerTeam = player.team;
        addLog(`✅ ${player.name} dice: ¡QUIERO! (${state.pendingCall.label})`);
        state.pendingCall = null;
      } else if (state.pendingCall.type === 'envido') {
        addLog(`✅ ${player.name} dice: ¡QUIERO el Envido!`);
        resolveEnvido(true);
      }
      broadcastState();
      return;
    }

    if (action.kind === 'REJECT') {
      if (state.pendingCall.type === 'truco') {
        const winTeam = state.pendingCall.fromTeam;
        addLog(`❌ ${player.name} dice: No quiero.`);
        state.scores[winTeam] += state.trucoLevel;
        startNewHand();
      } else if (state.pendingCall.type === 'envido') {
        addLog(`❌ ${player.name} dice: No quiero el Envido.`);
        resolveEnvido(false);
        broadcastState();
      }
      return;
    }

    if (action.kind === 'CALL_TRUCO' && state.pendingCall.type === 'truco') {
      const next = state.pendingCall.nextLevel + 1;
      if (next <= 4) {
        const names = { 3: '¡RETRUCO!', 4: '¡QUIERO VALE 4!' };
        state.pendingCall = { type: 'truco', label: names[next], nextLevel: next, fromTeam: player.team };
        addLog(`🔥 ${player.name} canta: ${names[next]}`);
        broadcastState();
      }
      return;
    }

    if (action.kind === 'CALL_ENVIDO' && state.pendingCall.type === 'envido') {
      state.envidoChain.push(action.subType);
      state.pendingCall = {
        type: 'envido',
        label: action.subType,
        fromTeam: player.team
      };
      addLog(`🔥 ${player.name} redobla: ¡${action.subType.toUpperCase()}!`);
      broadcastState();
      return;
    }
    return;
  }

  if (pIdx !== state.turnIdx) return;

  if (action.kind === 'CALL_TRUCO') {
    const next = state.trucoLevel + 1;
    if (next <= 4 && state.trucoOwnerTeam !== player.team) {
      const names = { 2: '¡TRUCO!', 3: '¡RETRUCO!', 4: '¡QUIERO VALE 4!' };
      state.pendingCall = { type: 'truco', label: names[next], nextLevel: next, fromTeam: player.team };
      addLog(`🗣️ ${player.name} canta: ${names[next]}`);
      broadcastState();
    }
    return;
  }

  if (action.kind === 'CALL_ENVIDO' && !state.envidoDone && state.roundTrick === 0) {
    state.envidoChain = [action.subType];
    state.pendingCall = { type: 'envido', label: action.subType, fromTeam: player.team };
    addLog(`🗣️ ${player.name} canta: ¡${action.subType.toUpperCase()}!`);
    broadcastState();
    return;
  }

  if (action.kind === 'FOLD') {
    const winTeam = player.team === 0 ? 1 : 0;
    const pts = state.roundTrick === 0 && !state.envidoDone && state.trucoLevel === 1 ? 2 : state.trucoLevel;
    addLog(`🏳️ ${player.name} se va al mazo (+${pts} pts para Equipo ${winTeam === 0 ? 'A' : 'B'}).`);
    state.scores[winTeam] += pts;
    startNewHand();
    return;
  }

  if (action.kind === 'PLAY_CARD') {
    const [card] = player.hand.splice(action.cardIdx, 1);
    if (!card) return;
    player.played.push(card);
    state.currentPlays.push({ playerIdx: pIdx, card });
    addLog(`🃏 ${player.name} juega ${card.label}`);

    if (state.currentPlays.length < state.mode) {
      state.turnIdx = (state.turnIdx + 1) % state.mode;
      broadcastState();
    } else {
      evaluateTrick();
    }
  }
}

function getEnvidoPoints(accepted) {
  const table = { 'Envido': 2, 'Real Envido': 3 };
  if (!accepted) {
    if (state.envidoChain.length === 1) return 1;
    let sum = 0;
    for (let i = 0; i < state.envidoChain.length - 1; i++) {
      sum += table[state.envidoChain[i]] || 2;
    }
    return sum;
  }
  if (state.envidoChain.includes('Falta Envido')) {
    const leaderScore = Math.max(state.scores[0], state.scores[1]);
    return state.targetScore - leaderScore;
  }
  return state.envidoChain.reduce((acc, item) => acc + (table[item] || 2), 0);
}

function resolveEnvido(accepted) {
  const fromTeam = state.pendingCall.fromTeam;
  const pts = getEnvidoPoints(accepted);
  state.envidoDone = true;
  state.pendingCall = null;

  if (!accepted) {
    state.scores[fromTeam] += pts;
    addLog(`💰 Equipo ${fromTeam === 0 ? 'A' : 'B'} suma ${pts} pt(s) por Envido no querido.`);
    return;
  }

  let bestVal = -1;
  let winTeam = 0;
  let winnerName = '';

  for (let i = 0; i < state.mode; i++) {
    const idx = (state.dealerIdx + 1 + i) % state.mode;
    const p = state.players[idx];
    const fullHand = [...p.hand, ...p.played];
    const val = calculateEnvido(fullHand);
    addLog(`📣 ${p.name} canta: ${val} de envido`);
    if (val > bestVal) {
      bestVal = val;
      winTeam = p.team;
      winnerName = p.name;
    }
  }

  state.scores[winTeam] += pts;
  addLog(`🏆 ¡${winnerName} gana el Envido con ${bestVal} (+${pts} pts)!`);
}

function evaluateTrick() {
  let bestPower = -1;
  let bestPlays = [];

  for (const play of state.currentPlays) {
    const pwr = getTrucoPower(play.card);
    if (pwr > bestPower) {
      bestPower = pwr;
      bestPlays = [play];
    } else if (pwr === bestPower) {
      bestPlays.push(play);
    }
  }

  const teamsInTie = new Set(bestPlays.map((p) => state.players[p.playerIdx].team));
  let trickWinnerTeam = -1;

  if (teamsInTie.size === 1) {
    trickWinnerTeam = [...teamsInTie][0];
    state.turnIdx = bestPlays[0].playerIdx;
    addLog(`⚡ Mano ${state.roundTrick + 1} para Equipo ${trickWinnerTeam === 0 ? 'A' : 'B'}`);
  } else {
    state.turnIdx = (state.dealerIdx + 1) % state.mode;
    addLog(`⚖️ Mano ${state.roundTrick + 1} parda`);
  }

  state.trickWinners.push(trickWinnerTeam);
  state.roundTrick++;
  state.currentPlays = [];

  const handWinner = checkHandWinner();
  if (handWinner !== null) {
    addLog(`🎉 Equipo ${handWinner === 0 ? 'A' : 'B'} gana la ronda (+${state.trucoLevel} pts)`);
    state.scores[handWinner] += state.trucoLevel;
    setTimeout(() => startNewHand(), 2500);
  }
  broadcastState();
}

function checkHandWinner() {
  const w = state.trickWinners;
  const winsA = w.filter((x) => x === 0).length;
  const winsB = w.filter((x) => x === 1).length;

  if (winsA === 2) return 0;
  if (winsB === 2) return 1;
  if (w.length >= 2) {
    if (w[0] === -1 && w[1] !== -1) return w[1];
    if (w[0] !== -1 && w[1] === -1) return w[0];
  }
  if (w.length === 3) {
    if (w[2] !== -1) return w[2];
    const manoTeam = state.players[(state.dealerIdx + 1) % state.mode].team;
    return manoTeam;
  }
  return null;
}

// --- RENDERIZADO DE INTERFAZ ---
function render() {
  if (!state.started) {
    renderWaitingList();
    return;
  }

  document.getElementById('waiting-room').classList.add('hidden');
  document.getElementById('game-board').classList.remove('hidden');

  document.getElementById('score-0').textContent = state.scores[0];
  document.getElementById('score-1').textContent = state.scores[1];
  document.getElementById('target-score').textContent = state.targetScore;

  const meIdx = state.players.findIndex((p) => p.id === myId);
  const me = state.players[meIdx];
  const isMyTurn = meIdx === state.turnIdx && !state.pendingCall;

  const banner = document.getElementById('turn-banner');
  if (state.pendingCall) {
    const responder = state.pendingCall.fromTeam !== me.team;
    banner.textContent = responder
      ? `⚠️ Te cantaron ${state.pendingCall.label} — ¡Respondé!`
      : `⏳ Esperando respuesta a ${state.pendingCall.label}...`;
  } else {
    banner.textContent = isMyTurn
      ? '✨ ¡Es tu turno!'
      : `Turno de ${state.players[state.turnIdx].name}`;
  }

  document.getElementById('table-seats').innerHTML = state.players
    .map(
      (p, idx) =>
        `<div class="seat-tag ${idx === state.turnIdx ? 'active' : ''}">${p.name} (Eq. ${p.team === 0 ? 'A' : 'B'})</div>`
    )
    .join('');

 // Cartas jugadas en el paño
  document.getElementById('played-cards').innerHTML = state.currentPlays
    .map(
      (play) => `
      <div>
        <div class="card">
          <div>${play.card.num}</div>
          <div class="card-suit">${play.card.icon}</div>
          <div style="text-align:right">${play.card.num}</div>
        </div>
        <div class="card-owner">${state.players[play.playerIdx].name}</div>
      </div>`
    )
    .join('');
  
  const fullHand = [...me.hand, ...me.played];
  document.getElementById('my-envido').textContent = `Envido: ${calculateEnvido(fullHand)}`;
  document.getElementById('my-hand').innerHTML = me.hand
    .map(
      (c, i) => `
        <div class="card ${isMyTurn ? 'playable' : ''}" onclick="${isMyTurn ? `playCard(${i})` : ''}">
          <div>${c.num}</div>
          <div class="card-suit">${c.icon}</div>
          <div style="text-align:right">${c.num}</div>
        </div>`
    )
    .join('');

  renderButtons(me, isMyTurn);

  document.getElementById('game-log').innerHTML = state.logs
    .map((l) => `<div>${l}</div>`)
    .join('');
}

function renderButtons(me, isMyTurn) {
  const container = document.getElementById('action-buttons');
  let html = '';

  if (state.pendingCall && state.pendingCall.fromTeam !== me.team) {
    html += `<button class="btn primary" onclick="sendAction({kind:'ACCEPT'})">✅ Quiero</button>`;
    html += `<button class="btn danger" onclick="sendAction({kind:'REJECT'})">❌ No Quiero</button>`;

    if (state.pendingCall.type === 'truco' && state.pendingCall.nextLevel < 4) {
      const lbl = state.pendingCall.nextLevel === 2 ? 'Retruco' : 'Vale 4';
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_TRUCO'})">🔥 ${lbl}</button>`;
    }
    if (state.pendingCall.type === 'envido' && !state.envidoChain.includes('Falta Envido')) {
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Envido'})">Envido</button>`;
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Real Envido'})">Real Envido</button>`;
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Falta Envido'})">Falta Envido</button>`;
    }
  } else if (isMyTurn) {
    if (!state.envidoDone && state.roundTrick === 0) {
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Envido'})">Envido</button>`;
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Real Envido'})">Real Envido</button>`;
      html += `<button class="btn secondary" onclick="sendAction({kind:'CALL_ENVIDO', subType:'Falta Envido'})">Falta Envido</button>`;
    }
    if (state.trucoLevel < 4 && state.trucoOwnerTeam !== me.team) {
      const trucoNames = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' };
      html += `<button class="btn primary" onclick="sendAction({kind:'CALL_TRUCO'})">🔥 ${trucoNames[state.trucoLevel]}</button>`;
    }
    html += `<button class="btn danger" onclick="sendAction({kind:'FOLD'})">🏳️ Irse al mazo</button>`;
  }

  container.innerHTML = html;
}

function playCard(idx) {
  sendAction({ kind: 'PLAY_CARD', cardIdx: idx });
}
