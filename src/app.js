import { renderDashboard } from './dashboard.js';
import { DEMO_WEATHER_FIXTURE, renderWeatherExperience } from './weather/index.js';
import { renderCaregiver, renderProfile } from './profile/profile-experience.js';
import { renderAbout } from './about/about-experience.js';
import { renderOperator, renderOperatorQueue, renderEscalationQueue, renderAuditLog } from './operator/operator.js';
import { initializeShelterMatching } from './shelters/shelter-matching.js';
import './operator/operator.css';
import './about/about.css';
import './weather/weather.css';
import './shelters/shelters.css';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const routeAnnouncement = document.querySelector('#route-announcement');
const mainContent = document.querySelector('#main-content');
let toastTimer;
let activeViewCleanup = () => {};
let hasRendered = false;

const views = {
  dashboard: {
    title: 'Dashboard',
    message: 'Your emergency and weather readiness at a glance.',
  },
  weather: {
    title: 'Weather data',
    message: 'HKO warnings, observations, rainfall, and historical context.',
  },
  replay: {
    title: 'Replay',
    message: 'Replay uses real HKO historical records. The SIMULATION label will remain visible when this view is connected.',
  },
  map: {
    title: 'Live map',
    message: 'The map will show weather context, user-reported hazards, and Marine Department typhoon shelters for boats only.',
  },
  shelters: {
    title: 'Shelter Matching',
    message: 'Find accessible shelters based on your needs during emergencies.',
  },
  alerts: {
    title: 'Alerts',
    message: 'Alert history and acknowledgement status will appear here. Official warning text is preserved with its source.',
  },
  operator: {
    title: 'Operator view',
    message: 'Operator tools are separate from the user dashboard. No alert is created from this fixture view.',
  },
  'operator-hazards': {
    title: 'Operator report queue',
    message: 'App-generated hazard reports are advisory and require staff review.',
  },
  'operator-escalations': {
    title: 'Operator acknowledgements',
    message: 'Consent-aware acknowledgement and escalation overview.',
  },
  'operator-audit': {
    title: 'Operator audit log',
    message: 'Source ingestion and operator activity recorded for review.',
  },
  caregiver: {
    title: 'Caregiver',
    message: 'Caregiver status sharing is enabled for Grace Chen, with location sharing paused until consent is renewed.',
  },
  settings: {
    title: 'Settings',
    message: 'Profile, alert channels, consent, and text-size preferences will be managed here.',
  },
  about: {
    title: 'About & trust',
    message: 'PathGuard sources, product promise, privacy language, and current limitations.',
  },
};

function announce(message) {
  window.clearTimeout(toastTimer);
  toast.hidden = false;
  toast.textContent = message;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 5200);
}

function setActiveView(view) {
  const primaryView = view.startsWith('operator') ? 'operator' : view;
  document.querySelectorAll('[data-view]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.view === primaryView);
  });
}

function renderView(view) {
  activeViewCleanup();
  activeViewCleanup = () => {};
  if (view === 'alerts') {
    window.location.assign('./alerts.html');
    return;
  }
  if (view === 'map') {
    window.location.assign('./map-context.html');
    return;
  }
  if (view === 'dashboard') {
    renderDashboard(app, announce);
    return;
  }
  if (view === 'weather') {
    renderWeatherExperience(app, DEMO_WEATHER_FIXTURE);
    return;
  }
  if (view === 'shelters') {
    initializeShelterMatching(app);
    return;
  }
  if (view === 'settings') {
    renderProfile(app, announce);
    return;
  }
  if (view === 'caregiver') {
    renderCaregiver(app, announce);
    return;
  }
  if (view === 'operator') {
    activeViewCleanup = renderOperator(app, announce, 'overview');
    return;
  }
  if (view === 'replay') {
    activeViewCleanup = renderOperator(app, announce, 'replay');
    return;
  }
  if (view === 'operator-hazards') {
    renderOperatorQueue(app, announce);
    return;
  }
  if (view === 'operator-escalations') {
    renderEscalationQueue(app, announce);
    return;
  }
  if (view === 'operator-audit') {
    renderAuditLog(app, announce);
    return;
  }
  if (view === 'about') {
    renderAbout(app);
    return;
  }

  const selected = views[view] || views.dashboard;
  app.innerHTML = `
    <section class="placeholder-view" aria-labelledby="placeholder-title">
      <div class="eyebrow">PathGuard workspace</div>
      <h1 id="placeholder-title">${selected.title}</h1>
      <p class="placeholder-copy">${selected.message}</p>
      <button class="button button-primary" type="button" data-action="back-dashboard">Return to dashboard</button>
    </section>
  `;
}

function handleAction(action) {
  if (action === 'check-area') {
    announce('Area check complete. No new HKO warning was created. The weather feed is still unavailable.');
    return;
  }
  if (action === 'read-alert') {
    announce('Read aloud is available when an alert is opened. This dashboard keeps official warning text visible.');
    return;
  }
  if (action === 'back-dashboard') {
    window.location.hash = '#dashboard';
    return;
  }
  if (action === 'notifications') {
    announce('Two items need attention: a stale weather feed and caregiver consent renewal.');
    return;
  }
  if (action === 'profile') {
    announce('Profile menu: Alex Morgan, wheelchair and deaf profile.');
    return;
  }
  if (action === 'help') {
    announce('Help request is a fixture action. In production it will notify the configured caregiver and operator.');
  }
}

function syncFromHash() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const anchor = hash.startsWith('about-') ? hash : null;
  const view = anchor ? 'about' : hash;
  const normalizedView = views[view] ? view : 'dashboard';
  setActiveView(normalizedView);
  renderView(normalizedView);
  if (anchor) window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  if (hasRendered) {
    mainContent?.focus({ preventScroll: true });
    if (routeAnnouncement) routeAnnouncement.textContent = `${views[normalizedView].title} view opened.`;
  }
  hasRendered = true;
}

document.addEventListener('click', (event) => {
  const viewLink = event.target.closest('[data-view]');
  if (viewLink) {
    const view = viewLink.dataset.view;
    if (window.location.hash.replace('#', '') === view) {
      event.preventDefault();
      syncFromHash();
    }
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    event.preventDefault();
    handleAction(actionButton.dataset.action);
  }
});

window.addEventListener('hashchange', syncFromHash);
syncFromHash();
