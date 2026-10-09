export const SHELTER_SOURCE = Object.freeze({
  name: 'Demo Shelter Data',
  shortName: 'DEMO',
  description: 'Simulated shelter data for demonstration purposes',
  attribution: '⚠️ DEMO DATA: Shelter locations and features are simulated for demonstration.',
});

// Demo shelters in Hong Kong with realistic coordinates and accessibility features
export const DEMO_SHELTERS = Object.freeze([
  {
    id: 'shelter-001',
    name: 'Kowloon Bay Sports Centre',
    nameZh: '九龍灣體育館',
    address: '6 Kai Fuk Road, Kowloon Bay, Kowloon',
    coordinates: { lat: 22.3245, lng: 114.2111 },
    capacity: 250,
    currentOccupancy: 120,
    status: 'open',
    openingHours: '24/7 during emergencies',
    contact: '2382 1234',
    
    // Accessibility features
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilets: 4,
      powerOutlets: true,
      quietSpace: true,
      medicalRefrigeration: false,
      assistanceAnimalFriendly: true,
      wheelchairWidth: 120, // cm
      maxSlope: 8, // percent
      maxKerbHeight: 5, // cm
    },
    
    // Facilities
    facilities: {
      toilets: true,
      drinkingWater: true,
      chargingStations: true,
      seating: true,
      bedding: false,
      meals: false,
      medicalFirstAid: true,
    },
    
    lastVerified: '2025-01-10T14:30:00+08:00',
    dataFreshness: 'demo',
  },
  {
    id: 'shelter-002',
    name: 'Wan Chai Sports Ground',
    nameZh: '灣仔運動場',
    address: '28 Harbour Road, Wan Chai, Hong Kong Island',
    coordinates: { lat: 22.2802, lng: 114.1735 },
    capacity: 180,
    currentOccupancy: 45,
    status: 'open',
    openingHours: '24/7 during emergencies',
    contact: '2575 6789',
    
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilets: 2,
      powerOutlets: true,
      quietSpace: false,
      medicalRefrigeration: true,
      assistanceAnimalFriendly: true,
      wheelchairWidth: 110,
      maxSlope: 10,
      maxKerbHeight: 8,
    },
    
    facilities: {
      toilets: true,
      drinkingWater: true,
      chargingStations: true,
      seating: true,
      bedding: false,
      meals: false,
      medicalFirstAid: true,
    },
    
    lastVerified: '2025-01-12T09:15:00+08:00',
    dataFreshness: 'demo',
  },
  {
    id: 'shelter-003',
    name: 'Sham Shui Po Park Sports Centre',
    nameZh: '深水埗公園體育館',
    address: '269 Lai Chi Kok Road, Sham Shui Po, Kowloon',
    coordinates: { lat: 22.3301, lng: 114.1563 },
    capacity: 200,
    currentOccupancy: 190,
    status: 'open',
    openingHours: '24/7 during emergencies',
    contact: '2728 3456',
    
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilets: 3,
      powerOutlets: true,
      quietSpace: true,
      medicalRefrigeration: false,
      assistanceAnimalFriendly: true,
      wheelchairWidth: 115,
      maxSlope: 12,
      maxKerbHeight: 6,
    },
    
    facilities: {
      toilets: true,
      drinkingWater: true,
      chargingStations: true,
      seating: true,
      bedding: false,
      meals: false,
      medicalFirstAid: true,
    },
    
    lastVerified: '2025-01-11T16:45:00+08:00',
    dataFreshness: 'demo',
  },
  {
    id: 'shelter-004',
    name: 'Chai Wan Sports Centre',
    nameZh: '柴灣體育館',
    address: '338 Siu Sai Wan Road, Chai Wan, Hong Kong Island',
    coordinates: { lat: 22.2664, lng: 114.2375 },
    capacity: 220,
    currentOccupancy: 80,
    status: 'open',
    openingHours: '24/7 during emergencies',
    contact: '2896 7890',
    
    accessibility: {
      stepFreeEntry: false, // Has 3 steps at entrance
      liftAvailable: true,
      accessibleToilets: 1,
      powerOutlets: true,
      quietSpace: false,
      medicalRefrigeration: false,
      assistanceAnimalFriendly: true,
      wheelchairWidth: 100,
      maxSlope: 15,
      maxKerbHeight: 10,
    },
    
    facilities: {
      toilets: true,
      drinkingWater: true,
      chargingStations: true,
      seating: true,
      bedding: false,
      meals: false,
      medicalFirstAid: true,
    },
    
    lastVerified: '2025-01-09T11:20:00+08:00',
    dataFreshness: 'demo',
  },
  {
    id: 'shelter-005',
    name: 'Tuen Mun Town Hall',
    nameZh: '屯門大會堂',
    address: '3 Tuen Hei Road, Tuen Mun, New Territories',
    coordinates: { lat: 22.3945, lng: 113.9756 },
    capacity: 300,
    currentOccupancy: 150,
    status: 'open',
    openingHours: '24/7 during emergencies',
    contact: '2450 1234',
    
    accessibility: {
      stepFreeEntry: true,
      liftAvailable: true,
      accessibleToilets: 5,
      powerOutlets: true,
      quietSpace: true,
      medicalRefrigeration: true,
      assistanceAnimalFriendly: true,
      wheelchairWidth: 130,
      maxSlope: 5,
      maxKerbHeight: 3,
    },
    
    facilities: {
      toilets: true,
      drinkingWater: true,
      chargingStations: true,
      seating: true,
      bedding: true,
      meals: true,
      medicalFirstAid: true,
    },
    
    lastVerified: '2025-01-13T13:10:00+08:00',
    dataFreshness: 'demo',
  },
]);

// User accessibility profile structure
export const DEFAULT_USER_PROFILE = Object.freeze({
  mobility: {
    wheelchairType: 'none', // 'none', 'manual', 'power', 'walker', 'cane'
    canUseStairs: true,
    maxSlope: 15, // percent
    minPathWidth: 90, // cm
    maxKerbHeight: 8, // cm
    assistanceNeeded: false,
  },
  sensory: {
    hearing: 'normal', // 'normal', 'hard_of_hearing', 'deaf'
    vision: 'normal', // 'normal', 'low_vision', 'blind'
    preferredAlertChannels: ['visual', 'vibration', 'audio'],
  },
  cognitive: {
    simplifiedInstructions: false,
    preferredLanguage: 'en',
    largeText: false,
  },
  facilities: {
    accessibleToilet: false,
    powerForMedicalDevice: false,
    quietSpace: false,
    medicationRefrigeration: false,
    assistanceAnimal: false,
  },
});

// Shelter matching algorithms
export function filterSheltersByHardConstraints(shelters, profile) {
  return shelters.filter(shelter => {
    const { accessibility } = shelter;
    const { mobility, facilities } = profile;
    
    // Check step-free entry for wheelchair users
    if (mobility.wheelchairType !== 'none' && !accessibility.stepFreeEntry) {
      return false;
    }
    
    // Check path width
    if (mobility.wheelchairType !== 'none' && accessibility.wheelchairWidth < mobility.minPathWidth) {
      return false;
    }
    
    // Check slope tolerance
    if (accessibility.maxSlope > mobility.maxSlope) {
      return false;
    }
    
    // Check facility requirements
    if (facilities.accessibleToilet && accessibility.accessibleToilets === 0) {
      return false;
    }
    
    if (facilities.powerForMedicalDevice && !accessibility.powerOutlets) {
      return false;
    }
    
    if (facilities.quietSpace && !accessibility.quietSpace) {
      return false;
    }
    
    if (facilities.medicationRefrigeration && !accessibility.medicalRefrigeration) {
      return false;
    }
    
    if (facilities.assistanceAnimal && !accessibility.assistanceAnimalFriendly) {
      return false;
    }
    
    return true;
  });
}

export function calculateShelterScore(shelter, profile, userLocation = null) {
  let score = 100;
  const { accessibility, capacity, currentOccupancy } = shelter;
  const { mobility, facilities } = profile;
  
  // Capacity score (higher capacity margin = better)
  const capacityMargin = capacity - currentOccupancy;
  const capacityScore = Math.min(100, (capacityMargin / capacity) * 100);
  score = score * 0.3 + capacityScore * 0.7;
  
  // Accessibility match score
  let accessibilityScore = 100;
  
  if (mobility.wheelchairType !== 'none') {
    // Prefer wider paths
    const widthRatio = accessibility.wheelchairWidth / mobility.minPathWidth;
    accessibilityScore *= Math.min(1.2, widthRatio);
    
    // Prefer gentler slopes
    const slopeRatio = mobility.maxSlope / accessibility.maxSlope;
    accessibilityScore *= Math.min(1.1, slopeRatio);
  }
  
  // Facility match bonus
  let facilityBonus = 0;
  if (facilities.accessibleToilet && accessibility.accessibleToilets > 0) {
    facilityBonus += 10 * Math.min(2, accessibility.accessibleToilets);
  }
  if (facilities.powerForMedicalDevice && accessibility.powerOutlets) {
    facilityBonus += 15;
  }
  if (facilities.quietSpace && accessibility.quietSpace) {
    facilityBonus += 10;
  }
  if (facilities.medicationRefrigeration && accessibility.medicalRefrigeration) {
    facilityBonus += 20;
  }
  
  score += facilityBonus;
  
  // Data freshness penalty
  if (shelter.dataFreshness === 'demo') {
    score *= 0.9; // 10% penalty for demo data
  }
  
  return Math.round(score);
}

export function rankShelters(shelters, profile, userLocation = null) {
  const filtered = filterSheltersByHardConstraints(shelters, profile);
  
  return filtered
    .map(shelter => ({
      shelter,
      score: calculateShelterScore(shelter, profile, userLocation),
      hardConstraintsPassed: true,
    }))
    .sort((a, b) => b.score - a.score);
}

export function getShelterById(shelterId) {
  return DEMO_SHELTERS.find(shelter => shelter.id === shelterId);
}

export function updateShelterStatus(shelterId, updates) {
  // In a real app, this would make an API call
  console.log(`Updating shelter ${shelterId}:`, updates);
  return { success: true, message: 'DEMO: Shelter status updated (simulated)' };
}

// Format shelter information for display
export function formatShelterInfo(shelter) {
  return {
    name: shelter.name,
    address: shelter.address,
    capacity: `${shelter.currentOccupancy}/${shelter.capacity}`,
    status: shelter.status,
    accessibilitySummary: getAccessibilitySummary(shelter.accessibility),
    facilitiesSummary: getFacilitiesSummary(shelter.facilities),
    lastUpdated: formatDate(shelter.lastVerified),
    isDemoData: shelter.dataFreshness === 'demo',
  };
}

function getAccessibilitySummary(accessibility) {
  const features = [];
  if (accessibility.stepFreeEntry) features.push('Step-free entry');
  if (accessibility.liftAvailable) features.push('Lift available');
  if (accessibility.accessibleToilets > 0) features.push(`${accessibility.accessibleToilets} accessible toilets`);
  if (accessibility.powerOutlets) features.push('Power outlets');
  if (accessibility.quietSpace) features.push('Quiet space');
  if (accessibility.medicalRefrigeration) features.push('Medical refrigeration');
  if (accessibility.assistanceAnimalFriendly) features.push('Assistance animal friendly');
  
  return features.length > 0 ? features.join(' • ') : 'Basic accessibility';
}

function getFacilitiesSummary(facilities) {
  const features = [];
  if (facilities.toilets) features.push('Toilets');
  if (facilities.drinkingWater) features.push('Drinking water');
  if (facilities.chargingStations) features.push('Charging');
  if (facilities.seating) features.push('Seating');
  if (facilities.bedding) features.push('Bedding');
  if (facilities.meals) features.push('Meals');
  if (facilities.medicalFirstAid) features.push('First aid');
  
  return features.length > 0 ? features.join(' • ') : 'Basic facilities';
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Invalid date';
  }
}