```text
                                         _.oo.
                 _.u[[/;:,.         .odMMMMMM'
              .o888UU[[[/;:-.  .o@P^    MMM^
             oN88888UU[[[/;::-.        dP^
            dNMMNN888UU[[[/;:--.   .o@P^
           ,MMMMMMN888UU[[/;::-. o@^
           NNMMMNN888UU[[[/~.o@P^
           888888888UU[[[/o@^-..
          oI8888UU[[[/o@P^:--..
       .@^  YUU[[[/o@^;::---..
     oMP     ^/o@P^;:::---..
  .dMMM    .o@^ ^;::---...
 dMMMMMMM@^`       `^^^^
YMMMUP^
```

# Orbita Desktop

> High-performance, end-to-end encrypted desktop messenger with native Windows integration, real-time messaging, and low-latency voice and video calls.

---

## Overview

Orbita is a secure and minimalist desktop communication platform engineered with an emphasis on cryptographic privacy, memory efficiency, and native operating system integration.

---

## Core Capabilities

- **End-to-End Encryption (E2EE)**: Implementation of the Double Ratchet protocol (X25519, HKDF, AES-GCM / ChaCha20-Poly1305) ensures zero-knowledge forward secrecy and backward privacy.
- **Low-Latency Calls**: High-definition peer-to-peer and multi-party voice/video calling powered by LiveKit and WebRTC with dedicated lightweight window processes.
- **Resilient Realtime Transport**: Redundant transport architecture featuring automatic failover and load balancing between Pusher and Ably networks.
- **Native Rust Engine**: High-performance Win32 system tray integration, native system interactions, and hardware-accelerated cryptographic routines via N-API.
- **Dynamic Interface Engine**: Material Design 3 design system with customizable adaptive palettes and dark/light modes.
- **Local Vault Storage**: Secure, zero-telemetry local database with optimized memory and disk caching.

---

## Architecture and Technology Stack

- **Application Shell**: Electron (Chromium, Node.js)
- **Frontend Architecture**: React 19, Vite, TailwindCSS
- **Native Extension**: Rust (`napi-rs`, Win32 API)
- **Realtime Layer**: LiveKit Client, Pusher Channels, Ably Realtime
- **Gateway & Relay**: Cloudflare Workers, Vercel Serverless Gateway, Supabase
- **Cryptographic Core**: Double Ratchet, `@stablelib/x25519`, `@stablelib/sha256`, Native Rust Crypto

---

## Getting Started

### Prerequisites
- Node.js (v20 or newer)
- Rust and Cargo (for compiling `native/` modules)

### Installation
```bash
git clone https://github.com/orbita-messenger/orbita-desktop.git
cd orbita-desktop
npm install
```

### Development
```bash
npm run dev
```

### Production Build (Windows Installer)
```bash
npm run electron:build
```
Compiled setup executable will be generated in `release/setup_1.0.0-beta.exe`.

---

## Project Structure

```text
orbita-desktop/
├── api/                  # Serverless token gateway and relay endpoints
├── electron/             # Electron main and preload processes
├── native/               # Native Rust addon (N-API, Win32 system tray)
├── public/               # Static fonts, sounds, and assets
├── src/
│   ├── components/       # Interface components (chats, calls, settings)
│   ├── lib/              # Cryptographic algorithms and protocols
│   ├── locales/          # Internationalization dictionaries (RU, EN)
│   ├── services/         # Communication, network, and gateway services
│   ├── store/            # State management (Zustand)
│   ├── App.tsx           # Primary application window
│   └── call-main.tsx     # Dedicated call window entry point
├── call.html             # Call window markup
├── index.html            # Main application markup
└── vite.config.ts        # Vite multi-entry bundler configuration
```

---

## Contributors

- **Saizzi** — Creator and Lead Developer

---

## License

**Source-Available License (All Rights Reserved)**
- The source code is publicly accessible exclusively for viewing, evaluation, security audit, and educational research purposes.
- Copying, redistribution, commercial use, and creation of derivative works without prior written consent of the author are strictly prohibited.
- For complete terms and conditions, refer to the [LICENSE](LICENSE) file.
