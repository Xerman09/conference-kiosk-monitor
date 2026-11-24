# conference-kiosk-monitor

Live digital signage web application for conference room schedules built with Next.js, TypeScript, Tailwind CSS, and Directus.

## Features
- **Admin-Gated Room Selector (`/login` & `/kiosk/conference-room`)**: Authenticates against the Directus `user` table (`isAdmin = 1`) before allowing room selection or switching.
- **Unattended Full-Screen Kiosk Display (`/kiosk/conference-room/[roomId]`)**:
  - Large **VACANT** (emerald) / **OCCUPIED** (red) status indicator with current meeting details and progress bar.
  - 1-second live clock & chronological **Upcoming Today** schedule panel.
  - 60-second background polling with graceful **Reconnecting...** indicator and Screen Wake Lock.
  - Hidden/subtle bottom-right **Admin** lock button (`Escape` or `Ctrl+Shift+L`) to unlock and switch rooms.

## Getting Started
1. Copy `.env.example` to `.env.local` and configure `NEXT_PUBLIC_API_BASE_URL` and `DIRECTUS_STATIC_TOKEN`.
2. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev -- -p 7777
   ```
3. Open `http://localhost:7777`.
