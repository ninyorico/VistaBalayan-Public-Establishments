/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ocean-blue': '#0E5A72',
        'navy-blue': '#0B2530',
        'teal-blue': '#168AAD',
        'coastal-sand': '#F3EEE2',
        'sunlit-foam': '#FAFCFB',
        'mist-blue': '#EAF2F1',
        'mangrove-green': '#2F5F55',
        'sunset-coral': '#9A6A5A',
      },
      boxShadow: {
        tourism: '0 18px 56px rgba(11, 37, 48, 0.07)',
        'tourism-hover': '0 22px 72px rgba(11, 37, 48, 0.11)',
      },
    },
  },
  plugins: [],
}