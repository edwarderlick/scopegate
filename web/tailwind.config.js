/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: {
          void: '#1F0D15',
          base: '#200e16',
          low: '#29161e',
          card: '#2d1a22',
          high: '#39242c',
          bright: '#49333c',
        },
        parchment: {
          paper: '#FBF8F3',
          warm: '#F4EFEA',
          sand: '#EAE2D8',
        },
        primary: '#edb8cb',
        rose: '#ffb1c6',
        outline: '#9c8d91',
        ink: '#2d1622',
        allow: '#2E4A3E',
        deny: '#5E1D24',
        review: '#4D3A18',
        muted: '#2C2638',
      },
      fontFamily: {
        serif: ['Newsreader', 'serif'],
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        hairline: 'inset 0 0 0 1px rgba(251,248,243,0.12)',
        paper: 'inset 0 0 0 1px rgba(45,22,31,0.12)',
      },
    },
  },
  plugins: [],
};
