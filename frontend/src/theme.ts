import { Platform } from "react-native";

export const colors = {
  surface: "#121212",
  surface2: "#1E1E1E",
  surface3: "#2C2C2C",
  onSurface: "#FFFFFF",
  onSurface2: "#E0E0E0",
  onSurface3: "#CCCCCC",
  brand: "#D72638",
  brand2: "#FF4D4D",
  brandTertiary: "#4A1519",
  success: "#2E7D32",
  warning: "#F57F17",
  error: "#C62828",
  info: "#0277BD",
  border: "#2C2C2C",
  borderStrong: "#444444",
  divider: "#2C2C2C",
  muted: "#8A8A8A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
};

// "Display" feel — uppercase, tight letter-spacing — using system bold
export const fonts = {
  display: Platform.select({ ios: "Helvetica Neue", android: "sans-serif-condensed", default: "System" }) as string,
  text: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
};

export const displayStyle = (size: number) => ({
  fontFamily: fonts.display,
  fontWeight: "800" as const,
  letterSpacing: 1.2,
  fontSize: size,
  textTransform: "uppercase" as const,
  color: colors.onSurface,
});
