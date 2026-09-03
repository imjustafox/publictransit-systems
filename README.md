# Public Transit Systems

A comprehensive information resource about public transit systems worldwide, featuring a dark, data-dense aesthetic with terminal/monospace elements.

## Features

- **System Profiles** - Detailed information for transit systems including lines, stations, and railcar specifications
- **Interactive Maps** - Station maps with real entrance data
- **Live Incidents** - Real-time elevator/escalator status via WMATA API
- **System Comparison** - Compare stats across different transit systems
- **Global Search** - Fuzzy search across all systems, lines, and stations
- **Timeline Views** - Historical milestones for each system

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Search**: Fuse.js for client-side fuzzy search
- **Theme**: Dark mode by default with light mode support

## Getting Started

This repo uses [pnpm](https://pnpm.io) (a `preinstall` hook will stop npm and yarn installs). Node 22+ ships Corepack, so `corepack enable` gets you the pinned version; otherwise install pnpm however you like.

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run production server
pnpm start

# Run accessibility tests
pnpm test:accessibility

# Check linting
pnpm lint

# Format files
pnpm format
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
/src
  /app                    # Next.js App Router pages
    /[system]             # Dynamic system routes
      /lines/[line]       # Line detail pages
      /stations/[station] # Station detail pages
      /railcars/[model]   # Railcar detail pages
      /history            # System timeline
    /compare              # System comparison tool
    /search               # Global search
  /components
    /ui                   # Base components (Card, Badge, Terminal)
    /layout               # Header, ThemeProvider
    /transit              # Transit-specific components
    /search               # Search components
  /lib                    # Utilities and data loading

/data/systems             # Transit system data (JSON)
  /wmata                  # Washington Metro
  /sound-transit          # Seattle Link Light Rail
  /bart                   # San Francisco BART
```

## Adding a New System

1. Create a directory under `data/systems/{system-id}/`
2. Add four JSON files:
   - `system.json` - System overview and stats
   - `lines.json` - Lines with colors, termini, route topology, lengths
   - `stations.json` - Stations with coordinates and features
   - `railcars.json` - Railcar specifications
3. The system will automatically appear on the home page

## Environment Variables

For the WMATA incidents worker:

```
WMATA_API_KEY=your_api_key_here
```

Get a free API key at [developer.wmata.com](https://developer.wmata.com/)

## License

MIT
