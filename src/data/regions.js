// Region buckets derived from a tournament's ISO country code. Anything we
// can't place stays "Unknown" rather than being guessed.

export const REGIONS = ['CN', 'NA', 'EU', 'Other', 'Unknown']

const NA = new Set(['US', 'CA', 'MX', 'PR'])
const EU = new Set([
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU',
  'IE', 'IS', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK',
  'TR', 'UA', 'UK',
])

export function regionOf(country) {
  const cc = (country || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return 'Unknown'
  if (cc === 'CN') return 'CN'
  if (NA.has(cc)) return 'NA'
  if (EU.has(cc)) return 'EU'
  return 'Other'
}
