# ternssh Mobile

A native mobile client for [ternssh](https://ternssh.com), the SSH workspace on Cloudflare.

<p align="center">
  <strong>Connect to multiple ternssh deployments · Manage SSH hosts · Terminal access</strong>
</p>

## Features

- **Multi-Server Support**: Connect to multiple ternssh deployments simultaneously
- **Native UI**: Built with React Native / Expo for the best mobile experience
- **Secure Storage**: Credentials stored securely using device keychain (expo-secure-store)
- **SSH Host Management**: Add, edit, and organize SSH hosts with group support
- **Terminal Sessions**: Full terminal emulation with xterm.js
- **Session Management**: Track and manage active terminal sessions

## Architecture

### Native Components

All app screens use native React Native components:

- Server list (ternssh deployments)
- SSH host tree with groups
- Add/Edit forms for servers and hosts
- Sessions list
- Settings

### Terminal Rendering

The terminal view uses a WebView with [xterm.js](https://xtermjs.org/) for terminal emulation. This approach was chosen because:

1. **Accuracy**: xterm.js provides battle-tested VT100/xterm emulation with years of development
2. **Feature Completeness**: Full support for ANSI escape codes, colors, mouse events, and Unicode
3. **Compatibility**: Same rendering engine as the ternssh web client

All other UI remains native for the best mobile experience (smooth animations, native gestures, platform-specific styling).

### Multi-Server Design

The app supports connecting to multiple ternssh deployments:

1. **Server Configuration**: Each ternssh deployment is stored with:
   - Name (user-friendly label)
   - URL (the ternssh deployment URL)
   - Auth type (Basic Auth, Cloudflare Access, or None)
   - Credentials (stored securely in device keychain)

2. **Independent Sessions**: You can have terminal sessions open to different servers simultaneously

3. **Secure Storage**: All sensitive data (passwords) is stored using `expo-secure-store`, which uses:
   - iOS: Keychain Services
   - Android: SharedPreferences with encryption

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A ternssh deployment to connect to

### Installation

```bash
cd mobile
npm install
```

### Running the App

**Development mode:**

```bash
npm start
```

This starts the Expo development server. You can then:

- Press `i` to open in iOS Simulator (macOS only)
- Press `a` to open in Android Emulator
- Scan the QR code with the Expo Go app on your physical device

**iOS Simulator:**

```bash
npm run ios
```

**Android Emulator:**

```bash
npm run android
```

## Adding a ternssh Server

1. Open the app and go to the **Servers** tab
2. Tap the **+** button or "Add Server"
3. Enter the server details:
   - **Name**: A friendly name for this deployment
   - **URL**: The URL of your ternssh instance (e.g., `https://ternssh.example.com`)
   - **Authentication**: Choose the auth method:
     - **Basic Auth**: Enter username and password
     - **Cloudflare Access**: For deployments protected by Cloudflare Access
     - **None**: For deployments without authentication (not recommended)
4. Tap "Test Connection" to verify
5. Tap "Add Server" to save

## Managing SSH Hosts

After adding a ternssh server:

1. Tap on the server in the **Servers** tab
2. You'll see the SSH hosts configured on that ternssh deployment
3. Tap an SSH host to connect and open a terminal
4. Long-press a host for more options (Edit, Delete)
5. Use the **+** button to add new SSH hosts

## Building for Production

### iOS

```bash
npx expo build:ios
# or with EAS Build
npx eas build --platform ios
```

### Android

```bash
npx expo build:android
# or with EAS Build
npx eas build --platform android
```

## Authentication Methods

### Basic Auth

Standard HTTP Basic Authentication. Enter your username and password, which are stored securely on the device and sent with each API request.

### Cloudflare Access

If your ternssh deployment is protected by Cloudflare Access, the app will use your device's browser for authentication. This is handled automatically when connecting.

### No Auth (Development Only)

For local development deployments without authentication. Not recommended for production use.

## Troubleshooting

### Connection Issues

1. Verify the server URL is correct and accessible
2. Check that your ternssh deployment is running
3. If using Basic Auth, verify credentials
4. Ensure your device has internet connectivity

### Terminal Not Responding

1. Check the connection status indicator
2. Try disconnecting and reconnecting
3. Verify the SSH host is reachable from the ternssh server

### Sessions Not Persisting

Sessions are stored in memory only. If you close the app, sessions will be cleared but server configurations remain.

## Development

### Project Structure

```
mobile/
├── App.tsx                 # App entry point
├── src/
│   ├── api/                # API client for ternssh servers
│   │   └── client.ts
│   ├── assets/             # Static assets
│   │   └── terminal.html   # xterm.js terminal template
│   ├── context/            # React contexts
│   │   └── ServersContext.tsx
│   ├── navigation/         # Navigation setup
│   │   ├── AppNavigator.tsx
│   │   └── types.ts
│   ├── screens/            # App screens
│   │   ├── ServersScreen.tsx
│   │   ├── SessionsScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   ├── AddEditServerScreen.tsx
│   │   ├── SSHHostsScreen.tsx
│   │   ├── AddEditSSHHostScreen.tsx
│   │   └── TerminalScreen.tsx
│   ├── storage/            # Secure storage utilities
│   │   └── secureStorage.ts
│   └── types/              # TypeScript types
│       └── index.ts
├── package.json
└── tsconfig.json
```

### Type Checking

```bash
npx tsc --noEmit
```

### Building

```bash
npx expo export
```

## License

GPL-3.0-or-later (same as ternssh)
