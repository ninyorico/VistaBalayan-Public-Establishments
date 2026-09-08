# VistaBalayan Public Viewing Website

A visitor-facing tourism website for discovering establishments and planning visits in Balayan, Batangas.

## Features

- Public establishment listings
- Establishment details, photos, ratings, and reviews
- Map pins, directions, and road-distance estimates
- Nearby establishment recommendations
- Personalized recommendations based on visitor browsing behavior and preferences
- No establishment staff account required

## Tech Stack

- React 18
- Tailwind CSS
- Supabase (PostgreSQL)
- Leaflet and OpenStreetMap/OSRM mapping services
- Vite

## Local Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy the environment template and fill in the public Supabase project values:
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only the Supabase anonymous key belongs in the browser-facing application. Never put a Supabase service-role key or other server secret in a `VITE_` variable.
