/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'clay-canvas': '#F4F1FA',
        'clay-foreground': '#332F3A',
        'clay-muted': '#635F69',
        'clay-accent': '#7C3AED',
        'clay-accent-light': '#A78BFA',
        'clay-pink': '#DB2777',
        'clay-sky': '#0EA5E9',
        'clay-success': '#10B981',
        'clay-warning': '#F59E0B',
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'ui-rounded', 'sans-serif'],
      },
      borderRadius: {
        'clay-card': '2rem',
        'clay-control': '1.25rem',
      },
      boxShadow: {
        clayCard: '16px 16px 32px rgba(160, 150, 180, .20), -10px -10px 24px rgba(255, 255, 255, .90), inset 6px 6px 12px rgba(139, 92, 246, .03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
        clayButton: '12px 12px 24px rgba(139, 92, 246, .30), -8px -8px 16px rgba(255, 255, 255, .40), inset 4px 4px 8px rgba(255, 255, 255, .40), inset -4px -4px 8px rgba(0, 0, 0, .10)',
        clayPressed: 'inset 10px 10px 20px #d9d4e3, inset -10px -10px 20px #ffffff',
        tourism: '16px 16px 32px rgba(160, 150, 180, .20), -10px -10px 24px rgba(255, 255, 255, .90)',
        'tourism-hover': '20px 22px 42px rgba(160, 150, 180, .24), -12px -12px 28px rgba(255, 255, 255, .95)',
      },
      keyframes: {
        'clay-float': { '0%, 100%': { transform: 'translateY(0) rotate(0)' }, '50%': { transform: 'translateY(-20px) rotate(2deg)' } },
        'clay-breathe': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.02)' } },
      },
      animation: {
        'clay-float': 'clay-float 10s ease-in-out infinite',
        'clay-breathe': 'clay-breathe 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
