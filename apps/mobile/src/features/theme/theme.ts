import { useColorScheme } from 'react-native';

const light = {
  bg: '#FAFAF9',
  surface: '#F0EFED',
  surfaceRaised: '#FFFFFF',
  ink: '#141413',
  muted: '#6E6E6A',
  accent: '#141413',
  danger: '#D92D20',
  dangerSoft: 'rgba(217, 45, 32, 0.1)',
  line: 'rgba(20,20,19,0.08)',
  onAccent: '#FFFFFF',
  outline: 'rgba(0,0,0,0.1)',
} as const;

const dark = {
  bg: '#0C0C0B',
  surface: '#1A1A18',
  surfaceRaised: '#242422',
  ink: '#F4F3F0',
  muted: '#8A8A84',
  accent: '#F4F3F0',
  danger: '#FF6B5E',
  dangerSoft: 'rgba(255, 107, 94, 0.16)',
  line: 'rgba(255,255,255,0.1)',
  onAccent: '#0C0C0B',
  outline: 'rgba(255,255,255,0.1)',
} as const;

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  muted: string;
  accent: string;
  danger: string;
  dangerSoft: string;
  line: string;
  onAccent: string;
  outline: string;
};

export function useTheme() {
  const scheme = useColorScheme();
  const darkMode = scheme === 'dark';
  return {
    dark: darkMode,
    c: darkMode ? dark : light,
  };
}
