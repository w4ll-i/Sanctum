/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sanctum: {
          bg: '#080810',
          surface: '#0f0f1a',
          card: '#14141f',
          border: '#1e1e2e',
          'border-light': '#2a2a3e',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          'accent-muted': 'rgba(99,102,241,0.15)',
          text: '#e2e8f0',
          muted: '#64748b',
          subtle: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'sanctum-glow': 'radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 70%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'sanctum-sm': '0 0 0 1px rgba(99,102,241,0.2)',
        sanctum: '0 0 0 2px rgba(99,102,241,0.4)',
        'sanctum-lg': '0 0 30px rgba(99,102,241,0.15)',
        glass: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
