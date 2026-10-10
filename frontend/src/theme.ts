import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

/**
 * Assignment Roaster theme: dark, playful, with an orange -> pink "roast" gradient.
 * Chakra UI v3 system. The app is dark-only: `<html class="dark">` enables `_dark` conditions.
 */
const config = defineConfig({
  globalCss: {
    'html, body, #root': {
      minHeight: '100%',
    },
    html: {
      colorScheme: 'dark',
    },
    body: {
      bg: 'bg.canvas',
      color: 'fg.default',
      fontFamily: 'body',
      lineHeight: 'tall',
      overflowX: 'hidden',
    },
    '::selection': {
      bg: 'brand.500',
      color: 'white',
    },
    '*:focus-visible': {
      outline: '2px solid',
      outlineColor: 'brand.400',
      outlineOffset: '2px',
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: {
          value:
            "'Space Grotesk', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
        body: {
          value: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
        mono: {
          value: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        },
      },
      colors: {
        brand: {
          50: { value: '#fff4ec' },
          100: { value: '#ffe4d1' },
          200: { value: '#ffc5a3' },
          300: { value: '#ff9f6b' },
          400: { value: '#ff7a3d' },
          500: { value: '#ff5c1f' },
          600: { value: '#e8440f' },
          700: { value: '#c2340c' },
          800: { value: '#9a2a0f' },
          900: { value: '#7c2510' },
          950: { value: '#430f05' },
        },
        flame: {
          orange: { value: '#ff7a18' },
          coral: { value: '#ff4d4d' },
          pink: { value: '#ff2d95' },
          magenta: { value: '#c026d3' },
        },
        night: {
          900: { value: '#0b0710' },
          800: { value: '#130c1c' },
          700: { value: '#1c1226' },
          600: { value: '#271a33' },
          500: { value: '#352444' },
        },
      },
      gradients: {
        roast: {
          value: 'linear-gradient(135deg, #ff7a18 0%, #ff4d4d 50%, #ff2d95 100%)',
        },
        roastSoft: {
          value: 'linear-gradient(135deg, rgba(255,122,24,0.25) 0%, rgba(255,45,149,0.25) 100%)',
        },
        ember: {
          value: 'linear-gradient(135deg, #ff2d95 0%, #c026d3 100%)',
        },
      },
      radii: {
        card: { value: '1.25rem' },
        pill: { value: '9999px' },
      },
      shadows: {
        glass: { value: '0 20px 60px -20px rgba(0, 0, 0, 0.6)' },
        glow: { value: '0 0 0 1px rgba(255,122,24,0.35), 0 16px 48px -12px rgba(255,45,149,0.55)' },
      },
    },
    semanticTokens: {
      colors: {
        'bg.canvas': { value: '{colors.night.900}' },
        'bg.surface': { value: '{colors.night.800}' },
        'bg.elevated': { value: '{colors.night.700}' },
        'bg.glass': { value: 'rgba(255, 255, 255, 0.06)' },
        'border.glass': { value: 'rgba(255, 255, 255, 0.14)' },
        'fg.default': { value: '#f6f1f8' },
        'fg.muted': { value: '#b7acc2' },
        'fg.subtle': { value: '#857995' },
        brand: {
          solid: { value: '{colors.brand.500}' },
          contrast: { value: '#ffffff' },
          fg: { value: '{colors.brand.300}' },
          muted: { value: '{colors.brand.900}' },
          subtle: { value: 'rgba(255, 92, 31, 0.18)' },
          emphasized: { value: '{colors.brand.700}' },
          focusRing: { value: '{colors.brand.400}' },
        },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)

export default system
