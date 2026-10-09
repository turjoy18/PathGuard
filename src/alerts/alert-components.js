import { alertMeta, profile, severity } from './alerts-data.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function simulationBanner() {
  const banner = element('aside', 'simulation-banner');
  banner.setAttribute('aria-label', 'Simulation notice');
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-atomic', 'true');
  banner.innerHTML = '<span class="simulation-dot" aria-hidden="true"></span><strong>SIMULATION / REPLAY</strong><span>This demo does not send official alerts or replace official instructions.</span>';
  return banner;
}

export function severityBadge(level, compact = false) {
  const meta = severity[level] ?? severity.information;
  const badge = element('span', `severity-badge ${meta.className}${compact ? ' compact' : ''}`);
  badge.setAttribute('aria-label', `${meta.label}: ${meta.description}`);
  const icon = element('span', 'severity-icon', meta.icon);
  icon.setAttribute('aria-hidden', 'true');
  badge.append(icon, element('span', 'severity-label', meta.label));
  return badge;
}

export function dataSource({ detail = false } = {}) {
  const source = element('div', 'data-source');
  source.setAttribute('aria-label', `Data source: ${alertMeta.sourceDescription} Updated ${alertMeta.dataAge}`);
  source.innerHTML = `<span class="source-icon" aria-hidden="true">◌</span><span><strong>${detail ? 'Source' : 'Data source'}</strong> Hong Kong Observatory · Updated ${alertMeta.dataAge}</span>`;
  return source;
}

export function profileGuidance(profile, alert) {
  const section = element('section', 'profile-guidance');
  section.setAttribute('aria-labelledby', 'profile-guidance-title');
  const heading = element('h2', '', `Guidance for ${profile.name}'s profile`);
  heading.id = 'profile-guidance-title';
  const summary = element('p', 'profile-summary', `${profile.mobility} · ${profile.hearing} · ${profile.vision}`);
  section.append(heading, summary);

  const items = [
    ['Your visual alert is on', 'High-contrast text and an icon are shown. Sound is not required.', '✓'],
    ['Vibration is available', 'Your device received the alert vibration. The visual message remains the source of instructions.', '≋'],
  ];
  if (profile.simplifiedInstructions) {
    items.push(['Short instructions are on', `You will see: “${alert.simpleInstruction}”`, 'Aa']);
  }
  items.forEach(([title, description, icon]) => {
    const item = element('div', 'guidance-item');
    item.append(element('span', 'guidance-icon', icon), element('div', 'guidance-copy'));
    item.lastChild.append(element('strong', '', title), element('span', '', description));
    section.append(item);
  });
  return section;
}

function channelStatus(channel) {
  const item = element('li', 'channel-row');
  const icon = element('span', 'channel-icon', channel.icon);
  icon.setAttribute('aria-hidden', 'true');
  const name = element('span', 'channel-name', channel.name);
  const state = element('span', 'channel-state', `${channel.state} · ${channel.time}`);
  if (channel.state === 'Displayed' || channel.state === 'Supported') state.classList.add('channel-ok');
  item.append(icon, name, state);
  return item;
}

export function deliveryStatus(alert) {
  const section = element('section', 'delivery-card');
  section.setAttribute('aria-labelledby', 'delivery-title');
  const heading = element('h2', '', 'How this alert reached you');
  heading.id = 'delivery-title';
  const list = element('ul', 'channel-list');
  alert.channels.forEach((channel) => list.append(channelStatus(channel)));
  section.append(heading, list);
  return section;
}

function simulationPill(alert) {
  if (!alert.simulation) return null;
  const pill = element('span', 'replay-pill', 'REPLAY CONTENT');
  pill.setAttribute('title', 'This alert is a replay for demonstration.');
  return pill;
}

export function alertCard(alert, { acknowledged = false } = {}) {
  const article = element('article', `alert-card ${severity[alert.severity].className}`);
  article.dataset.alertId = alert.id;
  const top = element('div', 'card-topline');
  top.append(severityBadge(alert.severity, true));
  const replay = simulationPill(alert);
  if (replay) top.append(replay);
  top.append(element('time', 'alert-time', alert.occurredAt));

  const title = element('h2', 'alert-card-title', alert.shortTitle);
  const summary = element('p', 'alert-summary', alert.simpleInstruction);
  const footer = element('div', 'alert-card-footer');
  footer.append(element('span', acknowledged ? 'ack-state acknowledged' : 'ack-state', acknowledged ? '✓ Acknowledged' : 'Needs your response'));
  const open = element('button', 'text-button', 'Open alert');
  open.type = 'button';
  open.dataset.action = 'open';
  open.dataset.alertId = alert.id;
  footer.append(open);
  article.append(top, title, summary, footer);
  return article;
}

export function inbox({ alerts, profile, acknowledgedIds }) {
  const fragment = document.createDocumentFragment();
  fragment.append(simulationBanner());

  const header = element('header', 'page-heading');
  const eyebrow = element('p', 'eyebrow', 'Your safety inbox');
  const title = element('h1', '', 'Alerts');
  const intro = element('p', 'page-intro', 'Warnings and updates adapted to your alert preferences. Review active alerts first.');
  header.append(eyebrow, title, intro);
  fragment.append(header);

  const activeAlerts = alerts.filter((alert) => alert.status === 'active');
  const historyAlerts = alerts.filter((alert) => alert.status !== 'active');
  const activeSection = element('section', 'inbox-section');
  activeSection.setAttribute('aria-labelledby', 'active-alerts-title');
  const activeTitle = element('h2', 'section-title', 'Active now');
  activeTitle.id = 'active-alerts-title';
  const activeList = element('div', 'alert-list');
  activeAlerts.forEach((alert) => activeList.append(alertCard(alert, { acknowledged: acknowledgedIds.has(alert.id) })));
  activeSection.append(activeTitle, activeList);
  fragment.append(activeSection);

  const historySection = element('section', 'inbox-section');
  historySection.setAttribute('aria-labelledby', 'history-alerts-title');
  const historyTitle = element('h2', 'section-title', 'Alert history');
  historyTitle.id = 'history-alerts-title';
  const historyList = element('div', 'alert-list');
  historyAlerts.forEach((alert) => historyList.append(alertCard(alert, { acknowledged: acknowledgedIds.has(alert.id) })));
  historySection.append(historyTitle, historyList);
  fragment.append(historySection);

  const support = element('aside', 'trust-card');
  support.innerHTML = '<span class="trust-icon" aria-hidden="true">i</span><div><strong>PathGuard supports official information.</strong><p>It does not replace Hong Kong Observatory warnings, government instructions, or emergency services. Check official channels for the latest advice.</p></div>';
  support.append(dataSource());
  fragment.append(support);
  return fragment;
}

export function alertDetail(alert, { acknowledged = false, helpRequested = false } = {}) {
  const fragment = document.createDocumentFragment();
  fragment.append(simulationBanner());

  const topBar = element('div', 'detail-topbar');
  const back = element('button', 'back-button', '← Back to alerts');
  back.type = 'button';
  back.dataset.action = 'back';
  topBar.append(back, element('span', 'detail-context', 'Alert detail'));
  fragment.append(topBar);

  const main = element('article', `emergency-panel ${severity[alert.severity].className}`);
  main.setAttribute('aria-labelledby', 'alert-detail-title');
  const statusLine = element('div', 'emergency-status-line');
  statusLine.append(severityBadge(alert.severity));
  const replay = simulationPill(alert);
  if (replay) statusLine.append(replay);
  main.append(statusLine);

  const title = element('h1', '', alert.title);
  title.id = 'alert-detail-title';
  const location = element('p', 'detail-location', `${alert.area} · ${alert.updatedAt}`);
  const instruction = element('div', 'instruction-block');
  instruction.setAttribute('role', 'alert');
  instruction.append(element('span', 'instruction-label', 'Do this now'), element('p', 'instruction-text', alert.simpleInstruction));
  main.append(title, location, instruction);

  const actions = element('div', 'emergency-actions');
  const ok = element('button', 'primary-action', acknowledged ? '✓ I’m OK' : 'I’m OK');
  ok.type = 'button';
  ok.dataset.action = 'acknowledge';
  ok.setAttribute('aria-describedby', 'ack-help');
  const help = element('button', 'help-action', helpRequested ? 'Help requested' : 'I need help');
  help.type = 'button';
  help.dataset.action = 'help';
  help.disabled = helpRequested;
  actions.append(ok, help);
  const ackHelp = element('p', 'action-helper', acknowledged ? 'Your acknowledgement was recorded. Your caregiver can see this status.' : 'Choose one response. If you do not respond, your caregiver may be notified.');
  ackHelp.id = 'ack-help';
  main.append(actions, ackHelp);

  const speech = element('button', 'speech-button', '▶ Read this alert aloud');
  speech.type = 'button';
  speech.dataset.action = 'speak';
  speech.dataset.speech = `${alert.title}. ${alert.simpleInstruction} ${alert.instruction}`;
  speech.setAttribute('aria-describedby', 'speech-note');
  main.append(speech, element('p', 'speech-note', 'Uses your device voice. Audio is optional and never the only alert channel.'));

  const divider = element('hr', 'detail-divider');
  main.append(divider);
  const infoGrid = element('div', 'detail-grid');
  const guidance = profileGuidance(profile, alert);
  const delivery = deliveryStatus(alert);
  infoGrid.append(guidance, delivery);
  main.append(infoGrid);

  const details = element('details', 'more-details');
  const summary = element('summary', '', 'Read full instructions and source details');
  const copy = element('div', 'details-copy');
  copy.append(element('p', '', alert.instruction));
  const list = element('ul', 'instruction-list');
  alert.details.forEach((detail) => list.append(element('li', '', detail)));
  copy.append(list, dataSource({ detail: true }));
  details.append(summary, copy);
  main.append(details);

  const notice = element('p', 'official-notice');
  notice.innerHTML = '<strong>Important:</strong> This is a PathGuard demo and replay. Follow current official warnings and emergency instructions.';
  main.append(notice);
  fragment.append(main);
  return fragment;
}
