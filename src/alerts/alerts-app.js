import { alerts, getAlert, profile } from './alerts-data.js';
import { alertDetail, inbox } from './alert-components.js';

const main = document.querySelector('#main-content');
const storageKey = 'pathguard-alert-acknowledgements';
const helpKey = 'pathguard-alert-help';
const state = {
  view: 'inbox',
  selectedId: null,
  acknowledgedIds: new Set(readList(storageKey)),
  helpIds: new Set(readList(helpKey)),
};

function readList(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

function saveList(key, values) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // The alert remains usable if storage is unavailable.
  }
}

function render() {
  if (state.view === 'detail') {
    main.replaceChildren(alertDetail(getAlert(state.selectedId), {
      acknowledged: state.acknowledgedIds.has(state.selectedId),
      helpRequested: state.helpIds.has(state.selectedId),
    }));
  } else {
    main.replaceChildren(inbox({ alerts, profile, acknowledgedIds: state.acknowledgedIds }));
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  main.focus({ preventScroll: true });
}

function speak(text, button) {
  if (!('speechSynthesis' in window)) {
    button.textContent = 'Speech is not available on this device';
    button.setAttribute('aria-disabled', 'true');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.onstart = () => { button.textContent = '■ Stop reading'; };
  utterance.onend = () => { button.textContent = '▶ Read this alert aloud'; };
  utterance.onerror = () => { button.textContent = '▶ Read this alert aloud'; };
  if (button.textContent.startsWith('■')) {
    window.speechSynthesis.cancel();
    button.textContent = '▶ Read this alert aloud';
  } else {
    window.speechSynthesis.speak(utterance);
  }
}

main.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  const alertId = control.dataset.alertId ?? state.selectedId;

  if (action === 'open') {
    state.view = 'detail';
    state.selectedId = alertId;
    render();
  }
  if (action === 'back') {
    state.view = 'inbox';
    state.selectedId = null;
    render();
  }
  if (action === 'acknowledge') {
    state.acknowledgedIds.add(alertId);
    saveList(storageKey, state.acknowledgedIds);
    render();
    announce('Your response was recorded: I’m OK.');
  }
  if (action === 'help') {
    state.helpIds.add(alertId);
    saveList(helpKey, state.helpIds);
    render();
    announce(`Help requested. ${profile.caregiver} has been notified according to your settings.`);
  }
  if (action === 'speak') speak(control.dataset.speech, control);
});

function announce(message) {
  const live = document.createElement('div');
  live.className = 'visually-hidden';
  live.setAttribute('role', 'status');
  live.textContent = message;
  document.body.append(live);
  window.setTimeout(() => live.remove(), 4000);
}

render();
