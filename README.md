# VistaBalayan

A Web-Based Tourism Data Analytics and Decision Support System for Visitor Monitoring in Balayan, Batangas.

## Features

- Visitor and Accommodation Reporting
- Analytics Dashboard with Charts
- AI-Powered Insights and Anomaly Detection
- Role-Based Access (Tourism Officer & Establishment Staff)
- Report Approval Workflow

## Tech Stack

- React 18
- Tailwind CSS
- Supabase (PostgreSQL)
- Google Gemini AI
- Vite

## Local Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy the environment template and fill in your Supabase project values:
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
