// Demo human shelter data for PathGuard
// Realistic shelter locations in Hong Kong with accessibility features

const now = new Date('2025-09-27T09:00:00+08:00');

export const DEMO_SHELTERS = Object.freeze([
  {
    id: 'shelter-001',
    name: 'Kowloon Park Sports Centre',
    chineseName: '九龍公園體育館',
    type: 'sports_centre',
    location: {
      lat: 22.2987,
      lng: 114.1695,
      address: '22 Austin Road, Tsim Sha Tsui, Kowloon'
    },
    capacity: {
      total: 450,
      available: 320,
      lastUpdated: '2025-09-27T08:45:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: true,
      assistanceAnimalAllowed: true,
      verified: true,
      verifiedAt: '2025-09-15T10:00:00+08:00'
    },
    facilities: ['First aid', 'Drinking water', 'Basic medical supplies', 'Charging stations'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2377 6666',
    notes: 'Primary shelter for Tsim Sha Tsui area'
  },
  {
    id: 'shelter-002',
    name: 'Central Market Community Hall',
    chineseName: '中環街市社區會堂',
    type: 'community_hall',
    location: {
      lat: 22.2839,
      lng: 114.1551,
      address: '93 Queen\'s Road Central, Central, Hong Kong Island'
    },
    capacity: {
      total: 280,
      available: 210,
      lastUpdated: '2025-09-27T08:50:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: false,
      assistanceAnimalAllowed: true,
      verified: true,
      verifiedAt: '2025-09-10T14:30:00+08:00'
    },
    facilities: ['First aid', 'Drinking water', 'Charging stations'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2852 1888',
    notes: 'Recently renovated with improved accessibility features'
  },
  {
    id: 'shelter-003',
    name: 'Mong Kok Community Centre',
    chineseName: '旺角社區中心',
    type: 'community_centre',
    location: {
      lat: 22.3187,
      lng: 114.1694,
      address: '123 Fa Yuen Street, Mong Kok, Kowloon'
    },
    capacity: {
      total: 380,
      available: 380,
      lastUpdated: '2025-09-27T08:30:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: true,
      assistanceAnimalAllowed: true,
      verified: true,
      verifiedAt: '2025-09-05T11:15:00+08:00'
    },
    facilities: ['First aid', 'Drinking water', 'Basic medical supplies', 'Wheelchair charging', 'Medication refrigeration'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2393 3333',
    notes: 'Has dedicated area for medical device charging'
  },
  {
    id: 'shelter-004',
    name: 'Causeway Bay Library',
    chineseName: '銅鑼灣圖書館',
    type: 'library',
    location: {
      lat: 22.2803,
      lng: 114.1831,
      address: '66 Moreton Terrace, Causeway Bay, Hong Kong Island'
    },
    capacity: {
      total: 220,
      available: 85,
      lastUpdated: '2025-09-27T08:55:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: false,
      quietSpace: true,
      assistanceAnimalAllowed: false,
      verified: false,
      verifiedAt: '2025-08-20T09:00:00+08:00'
    },
    facilities: ['First aid', 'Drinking water'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2887 5018',
    notes: 'Limited power outlets available'
  },
  {
    id: 'shelter-005',
    name: 'Shatin Town Hall',
    chineseName: '沙田大會堂',
    type: 'town_hall',
    location: {
      lat: 22.3814,
      lng: 114.1887,
      address: '1 Yuen Wo Road, Sha Tin, New Territories'
    },
    capacity: {
      total: 520,
      available: 520,
      lastUpdated: '2025-09-27T08:40:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: true,
      assistanceAnimalAllowed: true,
      verified: true,
      verifiedAt: '2025-09-12T16:20:00+08:00'
    },
    facilities: ['First aid', 'Drinking water', 'Basic medical supplies', 'Wheelchair charging', 'Medication refrigeration', 'Childcare area'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2694 2500',
    notes: 'Large capacity shelter with comprehensive facilities'
  },
  {
    id: 'shelter-006',
    name: 'Kwun Tong Promenade Activity Centre',
    chineseName: '觀塘海濱活動中心',
    type: 'activity_centre',
    location: {
      lat: 22.3122,
      lng: 114.2265,
      address: 'Kwun Tong Promenade, Kwun Tong, Kowloon'
    },
    capacity: {
      total: 180,
      available: 45,
      lastUpdated: '2025-09-27T08:35:00+08:00'
    },
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: false,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: false,
      assistanceAnimalAllowed: true,
      verified: false,
      verifiedAt: '2025-07-30T13:45:00+08:00'
    },
    facilities: ['First aid', 'Drinking water'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2345 6789',
    notes: 'Single-story building, no lift required'
  },
  {
    id: 'shelter-007',
    name: 'Aberdeen Sports Centre',
    chineseName: '香港仔體育館',
    type: 'sports_centre',
    location: {
      lat: 22.2478,
      lng: 114.1543,
      address: '38 Shek Pai Wan Road, Aberdeen, Hong Kong Island'
    },
    capacity: {
      total: 310,
      available: 310,
      lastUpdated: '2025-09-27T08:25:00+08:00'
    },
    accessibility: {
      stepFreeEntry: false,
      liftAvailable: true,
      accessibleToilet: true,
      powerAvailable: true,
      quietSpace: false,
      assistanceAnimalAllowed: false,
      verified: true,
      verifiedAt: '2025-09-08T15:30:00+08:00'
    },
    facilities: ['First aid', 'Drinking water', 'Charging stations'],
    status: 'open',
    openingHours: '24 hours during emergencies',
    contact: '+852 2555 1234',
    notes: 'Requires 3 steps at main entrance, ramp available at side entrance'
  }
]);

export const SHELTER_ACCESSIBILITY_LABELS = {
  stepFreeEntry: 'Step-free entrance',
  liftAvailable: 'Lift available',
  accessibleToilet: 'Accessible toilet',
  powerAvailable: 'Power outlets available',
  quietSpace: 'Quiet space available',
  assistanceAnimalAllowed: 'Assistance animals allowed'
};

export const SHELTER_STATUS = {
  open: { label: 'Open', className: 'status-open' },
  full: { label: 'At capacity', className: 'status-full' },
  closing: { label: 'Closing soon', className: 'status-closing' },
  closed: { label: 'Closed', className: 'status-closed' }
};

export function getShelterById(id) {
  return DEMO_SHELTERS.find(shelter => shelter.id === id) || null;
}

export function filterSheltersByAccessibility(profile) {
  return DEMO_SHELTERS.filter(shelter => {
    // Hard filters based on profile needs
    if (profile.mobility.includes('wheelchair') && !shelter.accessibility.stepFreeEntry) {
      return false;
    }
    if (profile.mobility.includes('wheelchair') && shelter.notes.includes('requires steps') && !shelter.accessibility.liftAvailable) {
      return false;
    }
    if (profile.facilities.includes('power') && !shelter.accessibility.powerAvailable) {
      return false;
    }
    if (profile.facilities.includes('quietSpace') && !shelter.accessibility.quietSpace) {
      return false;
    }
    if (profile.facilities.includes('assistanceAnimal') && !shelter.accessibility.assistanceAnimalAllowed) {
      return false;
    }
    return true;
  });
}

export function calculateShelterScore(shelter, profile, userLocation) {
  let score = 100;
  const weights = {
    capacity: 0.3,
    accessibility: 0.25,
    freshness: 0.15,
    facilities: 0.2,
    distance: 0.1
  };

  // Capacity score (higher available capacity = better)
  const capacityRatio = shelter.capacity.available / shelter.capacity.total;
  score += capacityRatio * 100 * weights.capacity;

  // Accessibility score
  const accessibilityCount = Object.values(shelter.accessibility)
    .filter(value => typeof value === 'boolean' && value === true)
    .length;
  const maxAccessibility = 6; // Total number of accessibility boolean fields
  score += (accessibilityCount / maxAccessibility) * 100 * weights.accessibility;

  // Freshness score (recently verified = better)
  if (shelter.accessibility.verified) {
    const verifiedDate = new Date(shelter.accessibility.verifiedAt);
    const daysSinceVerification = (now - verifiedDate) / (1000 * 60 * 60 * 24);
    if (daysSinceVerification < 30) {
      score += 100 * weights.freshness;
    } else if (daysSinceVerification < 90) {
      score += 50 * weights.freshness;
    }
  }

  // Facilities match score
  const profileFacilities = profile.facilities || [];
  const shelterFacilities = shelter.facilities || [];
  const matchedFacilities = profileFacilities.filter(facility => 
    shelterFacilities.some(sf => sf.toLowerCase().includes(facility.toLowerCase()))
  );
  const facilitiesMatchRatio = profileFacilities.length > 0 
    ? matchedFacilities.length / profileFacilities.length 
    : 0.5; // Default score if no facilities needed
  score += facilitiesMatchRatio * 100 * weights.facilities;

  return Math.round(score);
}

export function rankShelters(shelters, profile, userLocation) {
  return shelters
    .map(shelter => ({
      ...shelter,
      score: calculateShelterScore(shelter, profile, userLocation)
    }))
    .sort((a, b) => b.score - a.score);
}

export const DEMO_USER_PROFILE = {
  mobility: 'power_wheelchair',
  stairsCapability: 'cannot_use',
  maxSlope: 5, // degrees
  minWidth: 90, // cm
  hearing: 'deaf',
  vision: 'low_vision',
  simplifiedInstructions: true,
  largeText: true,
  facilities: ['power', 'accessibleToilet', 'quietSpace']
};

export const DEMO_USER_LOCATION = {
  lat: 22.3193,
  lng: 114.1694,
  address: 'Mong Kok, Kowloon'
};