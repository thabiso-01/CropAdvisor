export const colors = {
  primary: '#4CAF50',
  primaryDark: '#43A047',
  primaryDeep: '#2E7D32',
  primaryLight: '#E8F5E9',
  gradientStart: '#5DB761',
  gradientEnd: '#8BC34A',
  bg: '#F5F6F6',
  card: '#FFFFFF',
  inset: '#F1F3F4',
  segmentBg: '#EEF0F1',
  border: '#E6E9EB',
  text: '#1F2328',
  textSoft: '#3C4248',
  muted: '#6B7177',
  faint: '#9AA0A6',
  danger: '#E53935',
  // status (always paired with a label)
  good: '#43A047',
  warning: '#F9A825',
  serious: '#EF6C00',
  critical: '#D32F2F',
};

export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;

export const statusMeta: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  healthy: { label: 'Healthy', color: colors.good, bg: '#E8F5E9', icon: 'check-circle' },
  mild: { label: 'Mild issue', color: '#B7791F', bg: '#FFF8E1', icon: 'alert-circle' },
  moderate: { label: 'Moderate', color: colors.serious, bg: '#FFF3E0', icon: 'alert' },
  severe: { label: 'Severe', color: colors.critical, bg: '#FFEBEE', icon: 'alert-octagon' },
};

export const CROPS = [
  { id: '', name: 'Auto-detect', icon: 'auto-fix' },
  { id: 'tomato', name: 'Tomato', icon: 'fruit-cherries' },
  { id: 'maize', name: 'Maize', icon: 'corn' },
  { id: 'potato', name: 'Potato', icon: 'circle-slice-8' },
  { id: 'pepper', name: 'Pepper', icon: 'chili-mild' },
  { id: 'beans', name: 'Beans', icon: 'seed' },
  { id: 'cabbage', name: 'Cabbage', icon: 'leaf-circle' },
  { id: 'wheat', name: 'Wheat', icon: 'barley' },
  { id: 'spinach', name: 'Spinach', icon: 'leaf' },
] as const;

// South Africa's 11 official spoken languages, each named in its own language.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'xh', name: 'isiXhosa' },
  { code: 'nr', name: 'isiNdebele' },
  { code: 'nso', name: 'Sepedi' },
  { code: 'st', name: 'Sesotho' },
  { code: 'tn', name: 'Setswana' },
  { code: 'ss', name: 'siSwati' },
  { code: 've', name: 'Tshivenḓa' },
  { code: 'ts', name: 'Xitsonga' },
];
