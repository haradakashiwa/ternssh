import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  type ScaledSize,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useServers } from '../context/ServersContext';
import { getCredential } from '../storage/secureStorage';
import type { RootStackScreenProps } from '../navigation/types';

// Import terminal HTML as a string
const TERMINAL_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Terminal</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/css/xterm.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background-color: #1e1e1e; }
    #terminal { width: 100%; height: 100%; }
    .xterm { padding: 8px; }
    #status {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: #888;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px; text-align: center;
    }
    #status.error { color: #f44336; }
    #status.hidden { display: none; }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <div id="status">Connecting...</div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script>
    const statusEl = document.getElementById('status');
    let terminal = null;
    let fitAddon = null;
    let ws = null;
    let connected = false;

    function showStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.className = isError ? 'error' : '';
    }
    function hideStatus() { statusEl.className = 'hidden'; }
    function sendToRN(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
      }
    }

    function initTerminal() {
      terminal = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          cursorAccent: '#1e1e1e',
          selectionBackground: '#264f78',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5',
        },
      });
      fitAddon = new FitAddon.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(document.getElementById('terminal'));
      fitAddon.fit();
      terminal.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      terminal.onResize(({ cols, rows }) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
      window.addEventListener('resize', () => { if (fitAddon) fitAddon.fit(); });
      sendToRN('ready');
    }

    function connect(wsUrl) {
      showStatus('Connecting...');
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        if (fitAddon) {
          fitAddon.fit();
          ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
        }
      };
      ws.onmessage = (event) => {
        let data;
        if (event.data instanceof ArrayBuffer) {
          data = new TextDecoder().decode(event.data);
        } else {
          data = event.data;
        }
        if (data.startsWith('{')) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'error') {
              showStatus(parsed.message || 'Connection error', true);
              sendToRN('error', { message: parsed.message });
              return;
            }
            if (parsed.type === 'status' && 
                (parsed.message?.includes('Shell ready') || 
                 parsed.message?.includes('Shell 已就绪') ||
                 parsed.message?.includes('authenticated'))) {
              connected = true;
              hideStatus();
              terminal.reset();
              if (fitAddon) fitAddon.fit();
              sendToRN('connected');
              return;
            }
            if (parsed.type) return;
          } catch {}
        }
        terminal.write(data);
      };
      ws.onclose = () => {
        if (!connected) {
          showStatus('Connection closed', true);
        } else {
          terminal.writeln('\\r\\n\\x1b[33mConnection closed\\x1b[0m');
        }
        sendToRN('disconnected');
      };
      ws.onerror = () => {
        showStatus('Connection failed', true);
        sendToRN('error', { message: 'WebSocket connection failed' });
      };
    }
    function disconnect() { if (ws) { ws.close(); ws = null; } }
    function handleMessage(event) {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connect': connect(msg.wsUrl); break;
          case 'disconnect': disconnect(); break;
          case 'resize': if (fitAddon) fitAddon.fit(); break;
        }
      } catch (e) { console.error('Error handling message:', e); }
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
    initTerminal();
  </script>
</body>
</html>`;

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'error' | 'disconnected';

export function TerminalScreen({ navigation, route }: RootStackScreenProps<'Terminal'>) {
  const { serverId, sshHostId, sshHostName } = route.params;
  const { servers, getApiClient, addSession, updateSession, removeSession } = useServers();
  
  const webViewRef = useRef<WebView<object>>(null);
  const [status, setStatus] = useState<ConnectionStatus>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  const server = servers.find(s => s.id === serverId);
  const apiClient = getApiClient(serverId);

  useEffect(() => {
    navigation.setOptions({
      title: sshHostName,
      headerRight: () => (
        <TouchableOpacity 
          onPress={handleDisconnect}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Close</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, sshHostName]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      setDimensions(window);
      webViewRef.current?.postMessage(JSON.stringify({ type: 'resize' }));
    });
    return () => subscription?.remove();
  }, []);

  const handleDisconnect = useCallback(() => {
    if (sessionId) {
      removeSession(sessionId);
    }
    webViewRef.current?.postMessage(JSON.stringify({ type: 'disconnect' }));
    navigation.goBack();
  }, [sessionId, removeSession, navigation]);

  const startSession = useCallback(async () => {
    if (!apiClient || !server) {
      setStatus('error');
      setErrorMessage('Server configuration not found');
      return;
    }

    try {
      setStatus('connecting');
      
      // Create session via API
      const response = await apiClient.createSession(sshHostId);
      const wsUrl = apiClient.getTerminalWsUrl(response.sessionId);
      
      setSessionId(response.sessionId);
      
      // Add session to context
      addSession({
        id: `${serverId}-${response.sessionId}`,
        serverId,
        sshHostId,
        sessionId: response.sessionId,
        wsUrl: response.wsUrl,
        sftpWsUrl: response.sftpWsUrl,
        status: 'connecting',
        createdAt: new Date().toISOString(),
      });

      // Build the WebSocket URL with auth
      let finalWsUrl = wsUrl;
      
      // For basic auth, we need to include credentials in the WebSocket URL
      if (server.authType === 'basic' && server.username) {
        const password = await getCredential(server.id);
        if (password) {
          // Encode credentials in URL (WebSocket doesn't support custom headers directly)
          const url = new URL(wsUrl);
          url.username = server.username;
          url.password = password;
          finalWsUrl = url.toString();
        }
      }

      // Send connect message to WebView
      webViewRef.current?.postMessage(JSON.stringify({
        type: 'connect',
        wsUrl: finalWsUrl,
      }));
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create session');
    }
  }, [apiClient, server, serverId, sshHostId, addSession]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        message?: string;
      };
      
      switch (msg.type) {
        case 'ready':
          startSession();
          break;
        case 'connected':
          setStatus('connected');
          if (sessionId) {
            updateSession(sessionId, { status: 'open' });
          }
          break;
        case 'disconnected':
          setStatus('disconnected');
          if (sessionId) {
            updateSession(sessionId, { status: 'closed' });
          }
          break;
        case 'error':
          setStatus('error');
          setErrorMessage(msg.message ?? 'Connection error');
          if (sessionId) {
            updateSession(sessionId, { status: 'error' });
          }
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }, [startSession, sessionId, updateSession]);

  const handleRetry = useCallback(() => {
    setStatus('initializing');
    setErrorMessage(null);
    // The WebView will send 'ready' message which triggers startSession
    webViewRef.current?.reload();
  }, []);

  if (!server) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Server not found</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: TERMINAL_HTML }}
        style={[styles.webView, { width: dimensions.width, height: dimensions.height }]}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        textInteractionEnabled
      />
      
      {status === 'error' && (
        <View style={styles.overlay}>
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <View style={styles.errorButtons}>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={handleDisconnect}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {status === 'disconnected' && (
        <View style={styles.overlay}>
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>🔌</Text>
            <Text style={styles.errorTitle}>Disconnected</Text>
            <Text style={styles.errorMessage}>The connection was closed.</Text>
            <View style={styles.errorButtons}>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Reconnect</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={handleDisconnect}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 32,
  },
  webView: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: '#2d2d2d',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    marginHorizontal: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
});
