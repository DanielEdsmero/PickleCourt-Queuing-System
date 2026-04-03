const STORAGE_KEY = 'pickleball-matchmaker-v3';
const COURT_NUMBERS = [1, 2, 3, 4];
const COURT_SLOT_COUNT = 4;

const defaultState = {
  queues: {
    Beginner: [],
    Intermediate: [],
    Advanced: []
  },
  courts: {
    1: { players: [], reservationEndsAt: null },
    2: { players: [], reservationEndsAt: null },
    3: { players: [], reservationEndsAt: null },
    4: { players: [], reservationEndsAt: null }
  },
  dailyRoster: []
};

let state = loadState();
const selectedQueuePlayers = new Set();

const playerForm = document.getElementById('playerForm');
const playerNameInput = document.getElementById('playerName');
const skillLevelSelect = document.getElementById('skillLevel');
const matchLevelSelect = document.getElementById('matchLevel');
const manualCourtSelect = document.getElementById('manualCourtSelect');
const randomizeBtn = document.getElementById('randomizeBtn');
const autoRandomizeBtn = document.getElementById('autoRandomizeBtn');
const assignSelectedBtn = document.getElementById('assignSelectedBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const finishButtons = document.querySelectorAll('.finish-btn');
const reserveButtons = document.querySelectorAll('.reserve-btn');
const statusMessage = document.getElementById('statusMessage');
const totalPlayersEl = document.getElementById('totalPlayers');
const courtSlots = document.querySelectorAll('.court-slot');
const rosterSearchInput = document.getElementById('rosterSearch');
const dailyRosterEl = document.getElementById('dailyRoster');

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);

    const parsed = JSON.parse(saved);
    const courts = {};
    COURT_NUMBERS.forEach((courtNumber) => {
      const savedCourt = parsed?.courts?.[courtNumber] || {};
      const legacyHours = Number(savedCourt?.reservationHours || 0);
      const reservationEndsAt = Number(savedCourt?.reservationEndsAt || 0);
      courts[courtNumber] = {
        players: Array.isArray(savedCourt?.players) ? savedCourt.players : [],
        reservationEndsAt: reservationEndsAt > 0 ? reservationEndsAt : (legacyHours > 0 ? Date.now() + (legacyHours * 3600 * 1000) : null)
      };
    });

    return {
      queues: {
        Beginner: Array.isArray(parsed?.queues?.Beginner) ? parsed.queues.Beginner : [],
        Intermediate: Array.isArray(parsed?.queues?.Intermediate) ? parsed.queues.Intermediate : [],
        Advanced: Array.isArray(parsed?.queues?.Advanced) ? parsed.queues.Advanced : []
      },
      courts,
      dailyRoster: Array.isArray(parsed?.dailyRoster) ? parsed.dailyRoster : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function skillClassName(level) {
  return level ? level.toLowerCase() : '';
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function generateId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAllActivePlayers() {
  const queued = Object.values(state.queues).flat();
  const onCourts = Object.values(state.courts).flatMap((court) => court.players).filter(Boolean);
  return [...queued, ...onCourts];
}

function isPlayerActiveByName(name) {
  return getAllActivePlayers().some((player) => player.name.toLowerCase() === name.toLowerCase());
}

function findPlayerInQueues(playerId) {
  for (const level of Object.keys(state.queues)) {
    const player = state.queues[level].find((p) => p.id === playerId);
    if (player) return player;
  }
  return null;
}

function removePlayerFromQueues(playerId) {
  Object.keys(state.queues).forEach((level) => {
    state.queues[level] = state.queues[level].filter((p) => p.id !== playerId);
  });
  selectedQueuePlayers.delete(playerId);
}

function toggleQueueSelection(playerId) {
  if (selectedQueuePlayers.has(playerId)) {
    selectedQueuePlayers.delete(playerId);
  } else {
    selectedQueuePlayers.add(playerId);
  }
  updateQueueUI();
}

function getCourtLevelLabel(courtNumber) {
  const players = state.courts[courtNumber].players.filter(Boolean);
  if (players.length === 0) return 'Open';

  const levels = [...new Set(players.map((player) => player.level))];
  return levels.length === 1 ? levels[0] : 'Mixed';
}

function updateQueueUI() {
  let total = 0;

  Object.keys(state.queues).forEach((level) => {
    const queueList = document.getElementById(`queue-${level}`);
    const countPill = document.getElementById(`count-${level}`);
    const players = state.queues[level];

    total += players.length;
    countPill.textContent = players.length;
    queueList.innerHTML = '';

    if (players.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No players queued.';
      queueList.appendChild(empty);
      return;
    }

    players.forEach((player, index) => {
      const item = document.createElement('li');
      item.className = `queue-item ${selectedQueuePlayers.has(player.id) ? 'selected' : ''}`.trim();
      item.draggable = true;
      item.dataset.playerId = player.id;

      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', player.id);
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'queue-player-name';
      nameSpan.textContent = `${index + 1}. ${player.name}`;
      nameSpan.addEventListener('click', () => toggleQueueSelection(player.id));

      const actions = document.createElement('div');
      actions.className = 'queue-actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => {
        removePlayerFromQueues(player.id);
        updateQueueUI();
        saveState();
        setStatus(`${player.name} removed from ${level} queue.`);
      });

      actions.appendChild(removeBtn);
      item.appendChild(nameSpan);
      item.appendChild(actions);
      queueList.appendChild(item);
    });
  });

  totalPlayersEl.textContent = total;
}

function updateCourtUI(courtNumber) {
  const court = state.courts[courtNumber];
  const courtBoard = document.getElementById(`court${courtNumber}`);
  const levelBadge = document.getElementById(`court${courtNumber}Level`);
  const hoursBadge = document.getElementById(`court${courtNumber}Hours`);
  const slots = courtBoard.querySelectorAll('.court-slot');

  const label = getCourtLevelLabel(courtNumber);
  levelBadge.textContent = label;
  levelBadge.className = `court-level ${skillClassName(label)}`.trim();
  const remainingSeconds = getReservationSecondsRemaining(court);
  hoursBadge.textContent = `Reservation: ${formatCountdown(remainingSeconds)}`;

  slots.forEach((slot, index) => {
    const player = court.players[index];
    if (!player) {
      slot.textContent = 'Waiting';
      return;
    }

    slot.innerHTML = `<div class="player-card ${skillClassName(player.level)}">${player.name}<br><small>${player.level}</small></div>`;
  });
}

function getReservationSecondsRemaining(court, now = Date.now()) {
  if (!court.reservationEndsAt) return 0;
  return Math.max(0, Math.ceil((court.reservationEndsAt - now) / 1000));
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateAllCourts() {
  COURT_NUMBERS.forEach((courtNumber) => updateCourtUI(courtNumber));
}

function getOpenCourtNumber() {
  const openCourt = COURT_NUMBERS.find((courtNumber) => state.courts[courtNumber].players.filter(Boolean).length === 0);
  if (openCourt) return openCourt;
  return null;
}

function getFirstOpenSlot(courtNumber) {
  const courtPlayers = state.courts[courtNumber].players;
  for (let i = 0; i < COURT_SLOT_COUNT; i += 1) {
    if (!courtPlayers[i]) return i;
  }
  return -1;
}

function shuffle(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function ensurePlayerInDailyRoster(name, level) {
  const existing = state.dailyRoster.find((player) => player.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.level = level;
    existing.lastSeen = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return existing;
  }

  const rosterPlayer = {
    id: generateId(),
    name,
    level,
    lastSeen: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.dailyRoster.unshift(rosterPlayer);
  return rosterPlayer;
}

function addQueuePlayer(name, level) {
  const normalized = normalizeName(name);
  if (!normalized) {
    setStatus('Please enter a valid player name.');
    return false;
  }

  if (isPlayerActiveByName(normalized)) {
    setStatus('That player name already exists in queue or on a court.');
    return false;
  }

  ensurePlayerInDailyRoster(normalized, level);

  state.queues[level].push({
    id: generateId(),
    name: normalized,
    level
  });

  updateQueueUI();
  updateDailyRosterUI();
  saveState();
  setStatus(`${normalized} added to the ${level.toLowerCase()} queue.`);
  return true;
}

function addPlayerToCourt(player, courtNumber, specificSlot = null) {
  const openSlot = specificSlot ?? getFirstOpenSlot(courtNumber);

  if (openSlot === -1) {
    setStatus(`Court ${courtNumber} is already full.`);
    return false;
  }

  if (specificSlot !== null && state.courts[courtNumber].players[specificSlot]) {
    setStatus(`That square on Court ${courtNumber} is already occupied.`);
    return false;
  }

  state.courts[courtNumber].players[openSlot] = player;
  removePlayerFromQueues(player.id);
  updateQueueUI();
  updateCourtUI(courtNumber);
  updateDailyRosterUI();
  saveState();
  return true;
}

function randomizeMatch(level) {
  const openCourt = getOpenCourtNumber();
  if (!openCourt) {
    setStatus('All courts are currently full. Finish a court before randomizing another match.');
    return;
  }

  if (state.queues[level].length < 4) {
    setStatus(`Need at least 4 ${level.toLowerCase()} players in queue to randomize a match.`);
    return;
  }

  const selectedPlayers = shuffle(state.queues[level]).slice(0, 4);
  selectedPlayers.forEach((player) => removePlayerFromQueues(player.id));

  state.courts[openCourt].players = [...selectedPlayers];
  updateQueueUI();
  updateCourtUI(openCourt);
  updateDailyRosterUI();
  saveState();
  setStatus(`Court ${openCourt} filled with 4 random ${level.toLowerCase()} players.`);
}

function autoRandomize() {
  const orderedLevels = ['Beginner', 'Intermediate', 'Advanced'];
  const foundLevel = orderedLevels.find((level) => state.queues[level].length >= 4);

  if (!foundLevel) {
    setStatus('No level has at least 4 queued players yet.');
    return;
  }

  randomizeMatch(foundLevel);
}

function assignSelectedPlayersToCourt() {
  const courtNumber = Number(manualCourtSelect.value);
  const selectedPlayers = [...selectedQueuePlayers].map(findPlayerInQueues).filter(Boolean);

  if (selectedPlayers.length === 0) {
    setStatus('Select at least 1 player from the queue first.');
    return;
  }

  let addedCount = 0;
  selectedPlayers.forEach((player) => {
    if (addPlayerToCourt(player, courtNumber)) {
      addedCount += 1;
    }
  });

  if (addedCount > 0) {
    setStatus(`${addedCount} player${addedCount > 1 ? 's' : ''} added to Court ${courtNumber}. Mixed levels are allowed for manual placement.`);
  }
}

function addReservationHour(courtNumber) {
  const court = state.courts[courtNumber];
  const now = Date.now();
  const startFrom = court.reservationEndsAt && court.reservationEndsAt > now ? court.reservationEndsAt : now;
  court.reservationEndsAt = startFrom + (3600 * 1000);
  updateCourtUI(courtNumber);
  saveState();
  setStatus(`Added 1 hour to Court ${courtNumber}'s reservation timer.`);
}

function finishCourt(courtNumber) {
  if (state.courts[courtNumber].players.filter(Boolean).length === 0) {
    setStatus(`Court ${courtNumber} is already empty.`);
    return;
  }

  state.courts[courtNumber].players = [];
  updateCourtUI(courtNumber);
  saveState();
  updateDailyRosterUI();
  setStatus(`Court ${courtNumber} cleared.`);
}

function clearEverything() {
  state = structuredClone(defaultState);
  selectedQueuePlayers.clear();
  rosterSearchInput.value = '';
  updateQueueUI();
  updateAllCourts();
  updateDailyRosterUI();
  saveState();
  setStatus('Queues, courts, reservation timers, and the daily player list have been reset and are ready for new matches.');
}

function isPlayerQueuedOrOnCourt(name) {
  return isPlayerActiveByName(name);
}

function queueAgainFromRoster(rosterPlayer) {
  if (isPlayerQueuedOrOnCourt(rosterPlayer.name)) {
    setStatus(`${rosterPlayer.name} is already active in queue or on a court.`);
    return;
  }

  addQueuePlayer(rosterPlayer.name, rosterPlayer.level);
}

function updateDailyRosterUI() {
  const query = normalizeName(rosterSearchInput.value || '').toLowerCase();
  dailyRosterEl.innerHTML = '';

  const filtered = state.dailyRoster.filter((player) => player.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No players found in the daily list.';
    dailyRosterEl.appendChild(empty);
    return;
  }

  filtered.forEach((player) => {
    const item = document.createElement('div');
    item.className = 'roster-item';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'roster-name-group';

    const nameEl = document.createElement('div');
    nameEl.className = 'roster-name';
    nameEl.textContent = player.name;

    const meta = document.createElement('div');
    meta.className = 'roster-meta';
    const active = isPlayerQueuedOrOnCourt(player.name) ? 'Active now' : 'Not in queue';
    meta.textContent = `${active} • Last added ${player.lastSeen}`;

    const pill = document.createElement('span');
    pill.className = `skill-pill ${skillClassName(player.level)}`.trim();
    pill.textContent = player.level;

    nameGroup.appendChild(nameEl);
    nameGroup.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'roster-actions';

    const beginnerBtn = document.createElement('button');
    beginnerBtn.type = 'button';
    beginnerBtn.className = 'ghost-btn small-btn';
    beginnerBtn.textContent = 'Queue Beginner';
    beginnerBtn.addEventListener('click', () => {
      player.level = 'Beginner';
      queueAgainFromRoster(player);
      saveState();
      updateDailyRosterUI();
    });

    const intermediateBtn = document.createElement('button');
    intermediateBtn.type = 'button';
    intermediateBtn.className = 'ghost-btn small-btn';
    intermediateBtn.textContent = 'Queue Intermediate';
    intermediateBtn.addEventListener('click', () => {
      player.level = 'Intermediate';
      queueAgainFromRoster(player);
      saveState();
      updateDailyRosterUI();
    });

    const advancedBtn = document.createElement('button');
    advancedBtn.type = 'button';
    advancedBtn.className = 'ghost-btn small-btn';
    advancedBtn.textContent = 'Queue Advanced';
    advancedBtn.addEventListener('click', () => {
      player.level = 'Advanced';
      queueAgainFromRoster(player);
      saveState();
      updateDailyRosterUI();
    });

    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className = 'secondary-btn small-btn';
    quickBtn.textContent = 'Queue Again';
    quickBtn.addEventListener('click', () => queueAgainFromRoster(player));

    actions.appendChild(pill);
    actions.appendChild(quickBtn);
    actions.appendChild(beginnerBtn);
    actions.appendChild(intermediateBtn);
    actions.appendChild(advancedBtn);

    item.appendChild(nameGroup);
    item.appendChild(actions);
    dailyRosterEl.appendChild(item);
  });
}

playerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const level = skillLevelSelect.value;
  const added = addQueuePlayer(playerNameInput.value, level);

  if (added) {
    playerForm.reset();
    skillLevelSelect.value = level;
    playerNameInput.focus();
  }
});

randomizeBtn.addEventListener('click', () => randomizeMatch(matchLevelSelect.value));
autoRandomizeBtn.addEventListener('click', autoRandomize);
assignSelectedBtn.addEventListener('click', assignSelectedPlayersToCourt);
clearAllBtn.addEventListener('click', clearEverything);

finishButtons.forEach((button) => {
  button.addEventListener('click', () => finishCourt(Number(button.dataset.court)));
});

reserveButtons.forEach((button) => {
  button.addEventListener('click', () => addReservationHour(Number(button.dataset.reserveCourt)));
});

rosterSearchInput.addEventListener('input', updateDailyRosterUI);

courtSlots.forEach((slot) => {
  slot.addEventListener('dragover', (event) => {
    event.preventDefault();
    slot.classList.add('drag-over');
  });

  slot.addEventListener('dragleave', () => {
    slot.classList.remove('drag-over');
  });

  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    slot.classList.remove('drag-over');

    const playerId = event.dataTransfer.getData('text/plain');
    const player = findPlayerInQueues(playerId);

    if (!player) {
      setStatus('That player is no longer in queue.');
      return;
    }

    const courtNumber = Number(slot.dataset.court);
    const slotIndex = Number(slot.dataset.slot);
    const added = addPlayerToCourt(player, courtNumber, slotIndex);

    if (added) {
      setStatus(`${player.name} added to Court ${courtNumber}. Mixed levels are allowed for manual drag-and-drop.`);
    }
  });
});

updateQueueUI();
updateAllCourts();
updateDailyRosterUI();
saveState();

setInterval(() => {
  let didExpireReservation = false;
  const now = Date.now();

  COURT_NUMBERS.forEach((courtNumber) => {
    const court = state.courts[courtNumber];
    if (court.reservationEndsAt && court.reservationEndsAt <= now) {
      court.reservationEndsAt = null;
      didExpireReservation = true;
    }
    updateCourtUI(courtNumber);
  });

  if (didExpireReservation) {
    saveState();
  }
}, 1000);
