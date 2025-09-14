// overlay.js
const socket = io();
const listEl = document.getElementById('alerts-list');
const popupContainer = document.getElementById('popup-container');

// a short sound file you must place at public/sounds/donation.mp3
const donationSound = new Audio('/sounds/donation.mp3');

function formatAlert(alert) {
  return {
    id: alert.id,
    name: alert.name || 'Anonymous',
    amount: alert.amount ? alert.amount.toFixed(2) : '',
    currency: alert.currency || 'INR',
    ts: alert.ts || Date.now()
  };
}

function createCard(a) {
  const el = document.createElement('div');
  el.className = 'alert-card';
  el.id = 'alert-' + a.id;

  const avatar = document.createElement('div');
  avatar.className = 'alert-avatar';
  avatar.textContent = (a.name && a.name[0]) ? a.name[0].toUpperCase() : '?';

  const main = document.createElement('div');
  main.className = 'alert-main';
  main.innerHTML = `<div class="alert-name">${a.name}</div>
                    <div class="alert-meta">${a.amount} ${a.currency} • ${new Date(a.ts).toLocaleString()}</div>`;

  el.appendChild(avatar);
  el.appendChild(main);
  return el;
}

function addToList(a) {
  if (document.getElementById('alert-' + a.id)) return;
  const el = createCard(a);
  listEl.prepend(el);
}

function showBigPopup(a) {
  // create a transient big popup with confetti & sound; it will not remove the small list
  const popup = document.createElement('div');
  popup.className = 'big-popup';
  popup.innerHTML = `<div style="font-size:18px">${a.name} donated ${a.amount} ${a.currency}</div>`;

  popupContainer.innerHTML = '';
  popupContainer.appendChild(popup);

  // confetti
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { x: 0.9, y: 0.1 }
    });
  }

  // try to play sound (may require interaction; in OBS right-click > Interact and click the page)
  donationSound && donationSound.play().catch(e => { /* autoplay blocked */ });

  // keep popup visible (we keep it until page closed). If you want auto-hide, uncomment below:
  // setTimeout(() => { popupContainer.innerHTML = ''; }, 8000);
}

// socket events
socket.on('all_alerts', arr => {
  listEl.innerHTML = '';
  (arr || []).slice().reverse().forEach(raw => {
    addToList(formatAlert(raw));
  });
});

socket.on('new_alert', raw => {
  const a = formatAlert(raw);
  addToList(a);
  showBigPopup(a);
});
