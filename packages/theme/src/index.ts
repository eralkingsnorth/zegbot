export const colors = {
  bg: '#07080d',
  bgElevated: '#0f1117',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceHover: 'rgba(255, 255, 255, 0.09)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  accent: '#22d3ee',
  accentSoft: 'rgba(34, 211, 238, 0.15)',
  success: '#22c55e',
  successSoft: 'rgba(34, 197, 94, 0.15)',
  warning: '#f59e0b',
  danger: '#ef4444',
  whatsapp: '#25d366',
  userBubble: '#6366f1',
  assistantBubble: 'rgba(255, 255, 255, 0.08)',
  gradientStart: '#6366f1',
  gradientEnd: '#8b5cf6',
  glow: 'rgba(99, 102, 241, 0.35)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const shadows = {
  sm: '0 2px 8px rgba(0, 0, 0, 0.25)',
  md: '0 8px 24px rgba(0, 0, 0, 0.35)',
  lg: '0 16px 48px rgba(0, 0, 0, 0.45)',
  glow: `0 0 40px ${colors.glow}`,
};

export const layout = {
  maxWidth: 1200,
  sidebarWidth: 260,
  headerHeight: 72,
  tabBarHeight: 72,
};

export const brand = {
  name: 'Zegbot',
  tagline: 'Messaging AI Hub',
};

export type StatusTone = 'default' | 'success' | 'warning' | 'danger' | 'accent';

export function statusTone(status: string): StatusTone {
  if (status === 'connected') return 'success';
  if (status === 'connecting' || status === 'qr' || status === 'pairing') {
    return 'warning';
  }
  if (status === 'disconnected') return 'danger';
  return 'default';
}
