# Novella Launcher

A desktop app for managing and launching your visual novel library, built with Electron.

## Features

- **Library management** — add VNs with cover art, track status and playtime
- **VNDB integration** — search and pull metadata (title, description, tags, ratings) via the VNDB API
- **Launch games** — set and launch executables directly from the app
- **Personal ratings & reviews** — score entries and write notes; optionally sync ratings back to VNDB
- **Themes** — light, dark, and auto (follows system)
- **Auto-update check** — notifies you when a new release is available on GitHub

## Stack

| Layer | Tech |
|---|---|
| Shell | Electron |
| Frontend | Vanilla JS / HTML / CSS |
| API | [VNDB Kana API](https://api.vndb.org) via Axios |
| Storage | Local JSON files (`userData`) |
| Token security | Electron `safeStorage` (OS-level encryption) |

## Getting Started

```bash
npm install
npm start
```

### Optional: VNDB Token

Go to **Settings → VNDB Token** and paste a token from [vndb.org/u/tokens](https://vndb.org/u/tokens) to enable syncing your ratings to your VNDB account.

## Build

```bash
npm run build   # produces a distributable via electron-builder
```

## Data Location

All data is stored in Electron's `userData` directory:

| File | Contents |
|---|---|
| `config.json` | Settings (token, theme, preferences) |
| `library.json` | Your VN library |
| `user_ratings.json` | Personal scores and reviews |
| `covers/` | Cached cover images |

## License

MIT
