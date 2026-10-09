const now = new Date('2025-09-27T08:40:00+08:00');

export const profile = {
  name: 'Mei',
  mobility: 'Power wheelchair',
  hearing: 'Deaf',
  vision: 'Low vision',
  simplifiedInstructions: true,
  largeText: true,
  caregiver: 'Grace Chen',
  caregiverStatus: 'Waiting for your check-in',
};

export const severity = {
  evacuate: {
    label: 'Evacuate',
    icon: '◆',
    description: 'Take action now',
    className: 'severity-evacuate',
  },
  warning: {
    label: 'Warning',
    icon: '▲',
    description: 'Take care and follow instructions',
    className: 'severity-warning',
  },
  watch: {
    label: 'Watch',
    icon: '◐',
    description: 'Stay aware',
    className: 'severity-watch',
  },
  information: {
    label: 'Information',
    icon: '●',
    description: 'For your awareness',
    className: 'severity-information',
  },
};

export const alerts = [
  {
    id: 'hko-typhoon-replay-0927',
    severity: 'warning',
    title: 'Typhoon warning for your area',
    shortTitle: 'Typhoon warning',
    area: 'Kowloon and Victoria Harbour',
    occurredAt: 'Today, 08:35',
    updatedAt: 'Today, 08:35',
    source: 'Hong Kong Observatory',
    sourceType: 'Official weather source',
    simulation: true,
    status: 'active',
    instruction: 'Move indoors and stay away from windows. Check official guidance before you travel.',
    simpleInstruction: 'Go indoors. Stay away from windows.',
    details: [
      'Keep your phone charged and keep your emergency items nearby.',
      'Do not travel through flooded areas or use lifts during a power outage.',
      'This replay uses historical-style content for product demonstration only.',
    ],
    channels: [
      { name: 'Visual banner', state: 'Displayed', time: '08:35', icon: '▣' },
      { name: 'In-app alert', state: 'Displayed', time: '08:35', icon: '◉' },
      { name: 'Vibration', state: 'Supported', time: '08:35', icon: '≋' },
      { name: 'Speech', state: 'On demand', time: 'Not played', icon: '◖' },
    ],
  },
  {
    id: 'hko-rain-watch-0926',
    severity: 'watch',
    title: 'Heavy rain watch',
    shortTitle: 'Heavy rain watch',
    area: 'Your saved area',
    occurredAt: 'Yesterday, 18:10',
    updatedAt: 'Yesterday, 18:10',
    source: 'Hong Kong Observatory',
    sourceType: 'Official weather source',
    simulation: true,
    status: 'history',
    instruction: 'Watch for changes in the weather. Avoid low-lying areas if rain becomes heavy.',
    simpleInstruction: 'Watch for heavy rain. Avoid low-lying areas.',
    details: ['Check the latest official weather information before leaving.'],
    channels: [
      { name: 'Visual banner', state: 'Displayed', time: 'Yesterday, 18:10', icon: '▣' },
      { name: 'In-app alert', state: 'Displayed', time: 'Yesterday, 18:10', icon: '◉' },
    ],
  },
  {
    id: 'hko-storm-info-0923',
    severity: 'information',
    title: 'Tropical weather update',
    shortTitle: 'Tropical weather update',
    area: 'Hong Kong',
    occurredAt: 'Sep 23, 12:20',
    updatedAt: 'Sep 23, 12:20',
    source: 'Hong Kong Observatory',
    sourceType: 'Official weather source',
    simulation: true,
    status: 'history',
    instruction: 'A tropical system is being monitored. No action is required at this time.',
    simpleInstruction: 'No action is needed now.',
    details: [],
    channels: [{ name: 'In-app alert', state: 'Displayed', time: 'Sep 23, 12:20', icon: '◉' }],
  },
];

export const alertMeta = {
  lastSynced: now,
  dataAge: '5 minutes ago',
  sourceDescription: 'Weather information is replay content for this demo.',
};

export function getAlert(id) {
  return alerts.find((alert) => alert.id === id) ?? alerts[0];
}
