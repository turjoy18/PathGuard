export type SourceRegisterEntry = {
  name: string
  publisher: string
  use: string
  freshness: string
  attribution: string
  href: string
  linkLabel: string
}

export const aboutSourceLinks = {
  hkoOpenData: 'https://www.hko.gov.hk/en/open-data/open-data-info.htm',
  hkoApi: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php',
  marineDataset: 'https://data.gov.hk/en-data/dataset/hydro-hk-md-typhoon-shelters',
} as const

export const sourceRegister: SourceRegisterEntry[] = [
  {
    name: 'Weather warnings and warning summaries',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Personalised warning context; original HKO wording is retained.',
    freshness: 'As and when warnings change. Show source time and age.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: aboutSourceLinks.hkoOpenData,
    linkLabel: 'HKO open-data information',
  },
  {
    name: 'Regional observations and rainfall',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Local weather context, including provisional station observations.',
    freshness: 'Regional observations about every 10 minutes; rainfall past hour about every 15 minutes.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: aboutSourceLinks.hkoApi,
    linkLabel: 'HKO weather API',
  },
  {
    name: 'Climate history and tropical cyclone records',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Historical comparison and replay only. Never presented as a forecast.',
    freshness: 'Daily series are updated monthly; best-track data is updated yearly.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: aboutSourceLinks.hkoOpenData,
    linkLabel: 'HKO open-data information',
  },
  {
    name: 'Typhoon shelters',
    publisher: 'Marine Department · data.gov.hk',
    use: 'Marine map context for boats. Never a destination for people.',
    freshness: 'As and when there is an update; latest listed source update: 24 Jun 2025.',
    attribution: 'Marine Department attribution and licence terms: confirm before release.',
    href: aboutSourceLinks.marineDataset,
    linkLabel: 'Marine Department dataset',
  },
]
