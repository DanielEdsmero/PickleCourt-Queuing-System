const STORAGE_KEY = 'pickleball-matchmaker-v5';
const LEGACY_KEYS = ['pickleball-matchmaker-v4', 'pickleball-matchmaker-v3'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
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
  dailyRoster: [],
  autoFillOnFinish: true
};

let state = loadState();
const selectedQueuePlayers = new Set();

const playerForm = document.getElementById('playerForm');
const playerNameInput = document.getElementById('playerName');
const skillLevelSelect = document.getElementById('skillLevel');
const matchLevelSelect = document.getElementById('matchLevel');
const manualCourtSelect = document.getElementById('manualCourtSelect');
const randomizeBtn = document.getElementById('randomizeBtn');
const autoFillBtn = document.getElementById('autoFillBtn');
const assignSelectedBtn = document.getElementById('assignSelectedBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const finishButtons = document.querySelectorAll('.finish-btn');
const reserveButtons = document.querySelectorAll('.reserve-btn');
const statusMessage = document.getElementById('statusMessage');
const totalPlayersEl = document.getElementById('totalPlayers');
const courtSlots = document.querySelectorAll('.court-slot');
const rosterSearchInput = document.getElementById('rosterSearch');
const dailyRosterEl = document.getElementById('dailyRoster');
const autoFillOnFinishInput = document.getElementById('autoFillOnFinish');

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return hydrateState(JSON.parse(saved));

    for (const key of LEGACY_KEYS) {
      const legacySaved = localStorage.getItem(key);
      if (!legacySaved) continue;

      const legacyParsed = JSON.parse(legacySaved);
      if (key === 'pickleball-matchmaker-v4') {
        return hydrateState(migrateV4(legacyParsed));
      }

      return hydrateState(legacyParsed);
    }

    return structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function migrateV4(legacy) {
  const migrated = {
    queues: structuredClone(defaultState.queues),
    courts: legacy?.courts,
    dailyRoster: legacy?.dailyRoster,
    autoFillOnFinish: typeof legacy?.autoFillOnFinish === 'boolean' ? legacy.autoFillOnFinish : true
  };

  const singleQueue = Array.isArray(legacy?.queue) ? legacy.queue : [];
  singleQueue.forEach((player) => {
    const level = LEVELS.includes(player.level) ? player.level : 'Beginner';
    migrated.queues[level].push({
      ...player,
      level,
      queuedAt: Number(player.queuedAt || Date.now())
    });
  });

  return migrated;
}

function hydrateState(parsed) {
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

  const queues = {
    Beginner: Array.isArray(parsed?.queues?.Beginner) ? parsed.queues.Beginner : [],
    Intermediate: Array.isArray(parsed?.queues?.Intermediate) ? parsed.queues.Intermediate : [],
    Advanced: Array.isArray(parsed?.queues?.Advanced) ? parsed.queues.Advanced : []
  };

  LEVELS.forEach((level) => {
    queues[level] = queues[level].map((player) => ({
      ...player,
      level,
      queuedAt: Number(player.queuedAt || Date.now())
    }));
  });

  return {
    queues,
    courts,
    dailyRoster: Array.isArray(parsed?.dailyRoster) ? parsed.dailyRoster : [],
    autoFillOnFinish: typeof parsed?.autoFillOnFinish === 'boolean' ? parsed.autoFillOnFinish : true
  };
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

function getAllQueuedPlayers() {
  return LEVELS.flatMap((level) => state.queues[level]);
}

function getAllActivePlayers() {
  const queued = getAllQueuedPlayers();
  const onCourts = Object.values(state.courts).flatMap((court) => court.players).filter(Boolean);
  return [...queued, ...onCourts];
}

function isPlayerActiveByName(name) {
  return getAllActivePlayers().some((player) => player.name.toLowerCase() === name.toLowerCase());
}

function findPlayerInQueues(playerId) {
  for (const level of LEVELS) {
    const player = state.queues[level].find((entry) => entry.id === playerId);
    if (player) return player;
  }
  return null;
}

function removePlayerFromQueues(playerId) {
  LEVELS.forEach((level) => {
    state.queues[level] = state.queues[level].filter((entry) => entry.id !== playerId);
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

function renderUpcomingForLevel(level) {
  const container = document.getElementById(`upcoming-${level}`);
  container.innerHTML = '';

  const queue = state.queues[level];
  if (queue.length === 0) return;

  const groups = [];
  for (let i = 0; i < queue.length; i += COURT_SLOT_COUNT) {
    groups.push(queue.slice(i, i + COURT_SLOT_COUNT));
  }

  groups.forEach((group, index) => {
    const card = document.createElement('div');
    card.className = 'upcoming-card';

    const title = document.createElement('h4');
    title.textContent = `Box ${index + 1}`;

    const list = document.createElement('ol');
    group.forEach((player) => {
      const item = document.createElement('li');
      item.textContent = player.name;
      list.appendChild(item);
    });

    card.appendChild(title);
    card.appendChild(list);

    if (group.length < COURT_SLOT_COUNT) {
      const waiting = document.createElement('p');
      waiting.className = 'mini-note';
      waiting.textContent = `${COURT_SLOT_COUNT - group.length} more needed`;
      card.appendChild(waiting);
    }

    container.appendChild(card);
  });
}

function updateQueueUI() {
  let total = 0;

  LEVELS.forEach((level) => {
    const queue = state.queues[level];
    const listEl = document.getElementById(`queue-${level}`);
    const countEl = document.getElementById(`count-${level}`);
    listEl.innerHTML = '';

    countEl.textContent = queue.length;
    total += queue.length;

    if (queue.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No players queued.';
      listEl.appendChild(empty);
      renderUpcomingForLevel(level);
      return;
    }

    queue.forEach((player, index) => {
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
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        removePlayerFromQueues(player.id);
        updateQueueUI();
        saveState();
        setStatus(`${player.name} removed from ${level} queue.`);
      });

      actions.appendChild(removeBtn);
      item.appendChild(nameSpan);
      item.appendChild(actions);
      listEl.appendChild(item);
    });

    renderUpcomingForLevel(level);
  });

  totalPlayersEl.textContent = total;
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

function updateCourtUI(courtNumber) {
  const court = state.courts[courtNumber];
  const courtBoard = document.getElementById(`court${courtNumber}`);
  const levelBadge = document.getElementById(`court${courtNumber}Level`);
  const hoursBadge = document.getElementById(`court${courtNumber}Hours`);
  const slots = courtBoard.querySelectorAll('.court-slot');

  const label = getCourtLevelLabel(courtNumber);
  levelBadge.textContent = label;
  levelBadge.className = `court-level ${skillClassName(label)}`.trim();
  hoursBadge.textContent = `Reservation: ${formatCountdown(getReservationSecondsRemaining(court))}`;

  slots.forEach((slot, index) => {
    const player = court.players[index];
    if (!player) {
      slot.textContent = 'Waiting';
      return;
    }

    slot.innerHTML = `<div class="player-card ${skillClassName(player.level)}">${player.name}<br><small>${player.level}</small></div>`;
  });
}

function updateAllCourts() {
  COURT_NUMBERS.forEach((courtNumber) => updateCourtUI(courtNumber));
}

function getOpenCourtNumber() {
  return COURT_NUMBERS.find((courtNumber) => state.courts[courtNumber].players.filter(Boolean).length === 0) || null;
}

function getFirstOpenSlot(courtNumber) {
  const players = state.courts[courtNumber].players;
  for (let i = 0; i < COURT_SLOT_COUNT; i += 1) {
    if (!players[i]) return i;
  }
  return -1;
}

function getNextEligibleLevel() {
  const eligible = LEVELS
    .filter((level) => state.queues[level].length >= COURT_SLOT_COUNT)
    .map((level) => ({ level, queuedAt: state.queues[level][0].queuedAt || Number.MAX_SAFE_INTEGER }));

  if (eligible.length === 0) return null;
  eligible.sort((a, b) => a.queuedAt - b.queuedAt);
  return eligible[0].level;
}

function canAddPlayerToCourt(player, courtNumber) {
  const courtPlayers = state.courts[courtNumber].players.filter(Boolean);
  if (courtPlayers.length === 0) return true;

  const courtLevel = getCourtLevelLabel(courtNumber);
  return courtLevel === player.level;
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
    setStatus('That player already exists in queue or on a court.');
    return false;
  }

  ensurePlayerInDailyRoster(normalized, level);

  state.queues[level].push({
    id: generateId(),
    name: normalized,
    level,
    queuedAt: Date.now()
  });

  updateQueueUI();
  updateDailyRosterUI();
  saveState();
  setStatus(`${normalized} added to ${level} queue.`);
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

  if (!canAddPlayerToCourt(player, courtNumber)) {
    setStatus(`Court ${courtNumber} already has ${getCourtLevelLabel(courtNumber)} players. Choose a ${player.level} court.`);
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

function autoFillOpenCourts(showStatus = true) {
  let filledCourts = 0;

  while (true) {
    const openCourt = getOpenCourtNumber();
    if (!openCourt) break;

    const level = getNextEligibleLevel();
    if (!level) break;

    const nextGroup = state.queues[level].slice(0, COURT_SLOT_COUNT);
    nextGroup.forEach((player) => removePlayerFromQueues(player.id));
    state.courts[openCourt].players = nextGroup;
    filledCourts += 1;
  }

  updateQueueUI();
  updateAllCourts();
  updateDailyRosterUI();
  saveState();

  if (showStatus) {
    if (filledCourts > 0) {
      setStatus(`Auto-filled ${filledCourts} court${filledCourts > 1 ? 's' : ''} with same-level groups.`);
    } else {
      setStatus('Need at least 4 same-level players in a queue and an open court to auto-fill.');
    }
  }
}

function shuffle(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function randomizeMatch(level) {
  const openCourt = getOpenCourtNumber();
  if (!openCourt) {
    setStatus('All courts are full. Finish a court before randomizing.');
    return;
  }

  if (state.queues[level].length < COURT_SLOT_COUNT) {
    setStatus(`Need at least 4 ${level.toLowerCase()} players in queue to randomize.`);
    return;
  }

  const selectedPlayers = shuffle(state.queues[level]).slice(0, COURT_SLOT_COUNT);
  selectedPlayers.forEach((player) => removePlayerFromQueues(player.id));

  state.courts[openCourt].players = selectedPlayers;
  updateQueueUI();
  updateCourtUI(openCourt);
  updateDailyRosterUI();
  saveState();
  setStatus(`Court ${openCourt} filled with 4 randomized ${level.toLowerCase()} players.`);
}

function assignSelectedPlayersToCourt() {
  const courtNumber = Number(manualCourtSelect.value);
  const selectedPlayers = [...selectedQueuePlayers].map(findPlayerInQueues).filter(Boolean);

  if (selectedPlayers.length === 0) {
    setStatus('Select at least 1 player from queue first.');
    return;
  }

  let addedCount = 0;
  selectedPlayers.forEach((player) => {
    if (addPlayerToCourt(player, courtNumber)) {
      addedCount += 1;
    }
  });

  if (addedCount > 0) {
    setStatus(`${addedCount} player${addedCount > 1 ? 's' : ''} added to Court ${courtNumber}.`);
  }
}

function addReservationHour(courtNumber) {
  const court = state.courts[courtNumber];
  const now = Date.now();
  const startFrom = court.reservationEndsAt && court.reservationEndsAt > now ? court.reservationEndsAt : now;
  court.reservationEndsAt = startFrom + (3600 * 1000);
  updateCourtUI(courtNumber);
  saveState();
  setStatus(`Added 1 hour to Court ${courtNumber}.`);
}

function finishCourt(courtNumber) {
  if (state.courts[courtNumber].players.filter(Boolean).length === 0) {
    setStatus(`Court ${courtNumber} is already empty.`);
    return;
  }

  state.courts[courtNumber].players = [];

  if (state.autoFillOnFinish) {
    autoFillOpenCourts(false);
  }

  updateCourtUI(courtNumber);
  updateDailyRosterUI();
  saveState();

  if (!state.autoFillOnFinish) {
    setStatus(`Court ${courtNumber} finished. Auto-fill is off, so you can manually choose the next players.`);
    return;
  }

  if (state.courts[courtNumber].players.filter(Boolean).length === 4) {
    setStatus(`Court ${courtNumber} finished. Next same-level group was loaded automatically.`);
  } else {
    setStatus(`Court ${courtNumber} finished. Waiting for 4 same-level players to auto-load next game.`);
  }
}

function clearEverything() {
  state = structuredClone(defaultState);
  selectedQueuePlayers.clear();
  rosterSearchInput.value = '';
  updateQueueUI();
  updateAllCourts();
  updateDailyRosterUI();
  saveState();
  setStatus('Queues, courts, reservation timers, and daily player list were reset.');
}

function queueAgainFromRoster(rosterPlayer) {
  if (isPlayerActiveByName(rosterPlayer.name)) {
    setStatus(`${rosterPlayer.name} is already active in queue or on court.`);
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
    const active = isPlayerActiveByName(player.name) ? 'Active now' : 'Not in queue';
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
autoFillBtn.addEventListener('click', () => autoFillOpenCourts(true));
assignSelectedBtn.addEventListener('click', assignSelectedPlayersToCourt);
clearAllBtn.addEventListener('click', clearEverything);

finishButtons.forEach((button) => {
  button.addEventListener('click', () => finishCourt(Number(button.dataset.court)));
});

reserveButtons.forEach((button) => {
  button.addEventListener('click', () => addReservationHour(Number(button.dataset.reserveCourt)));
});

rosterSearchInput.addEventListener('input', updateDailyRosterUI);

autoFillOnFinishInput.checked = state.autoFillOnFinish;
autoFillOnFinishInput.addEventListener('change', () => {
  state.autoFillOnFinish = autoFillOnFinishInput.checked;
  saveState();
  setStatus(state.autoFillOnFinish
    ? 'Auto-fill on court finish is ON.'
    : 'Auto-fill on court finish is OFF. You can manually choose players.');
});

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
      setStatus(`${player.name} added to Court ${courtNumber}.`);
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
