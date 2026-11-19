# Overlay

Lightweight desktop overlay for real-time pets and GIFs between friends.

## Setup

```bash
npm install
npm start
```

## Server

```bash
npm run server
```

## Dev mode

```bash
npm run dev
```

## Project structure

```
src/
  main/        - Electron main process + WebSocket server
  renderer/    - HTML/CSS/JS for client UI
  preload/     - Context bridge
assets/        - Pet GIFs and images
tests/         - Unit tests
```
