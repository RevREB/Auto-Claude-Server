import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from './ui/button';
import { X, Terminal as TerminalIcon } from 'lucide-react';
import { API_URL, httpToWs } from '../lib/url-utils';

interface AuthTerminalProps {
  profileId: string;
  onClose: () => void;
  onTokenReceived?: (token: string, email?: string) => void;
}

/**
 * Terminal component for running `claude login` in the backend container.
 * Uses 'claude login' (not setup-token) to request all required scopes
 * including user:profile for usage tracking.
 * Connects to backend PTY service via WebSocket.
 */
export function AuthTerminal({ profileId, onClose, onTokenReceived }: AuthTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId] = useState(`auth-${profileId}-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm instance
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0B0B0F',
        foreground: '#E6E6E6',
        cursor: '#D6D876',
        selection: '#2A2A1F',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Create backend PTY session
    fetch(`${API_URL}/api/terminal/create/${sessionId}?auto_run=claude%20login`, {
      method: 'POST',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // Connect WebSocket
          const wsUrl = `${httpToWs(API_URL || window.location.origin)}/api/terminal/ws/${sessionId}`;
          const ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            setIsConnected(true);
            term.writeln('\x1b[32m✓ Connected to backend terminal\x1b[0m');
            term.writeln('\x1b[36mRunning: claude login\x1b[0m');
            term.writeln('');

            // Send initial terminal size
            ws.send(
              JSON.stringify({
                type: 'resize',
                cols: term.cols,
                rows: term.rows,
              })
            );
          };

          ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('[AuthTerminal] WebSocket message:', message.type, message);

            if (message.type === 'output') {
              term.write(message.data);
            } else if (message.type === 'token_extracted') {
              // Token was found in terminal output!
              console.log('[AuthTerminal] Token extracted! Calling callback...');
              term.writeln('\n\x1b[32m✓ Token extracted from output!\x1b[0m');

              // Call the callback immediately
              if (onTokenReceived) {
                onTokenReceived(message.token);

                // Auto-close modal after a short delay
                setTimeout(() => {
                  onClose();
                }, 2000);
              }
            }
          };

          ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            term.writeln('\x1b[31m✗ Connection error\x1b[0m');
          };

          ws.onclose = () => {
            setIsConnected(false);
            term.writeln('');
            term.writeln('\x1b[33m✓ Terminal session closed\x1b[0m');
            term.writeln('\x1b[36mExtracting token...\x1b[0m');

            // Try to extract token from CLI storage
            setTimeout(async () => {
              await extractTokenFromCLI();

              // Auto-close modal after a short delay
              setTimeout(() => {
                onClose();
              }, 1500);
            }, 1000);
          };

          wsRef.current = ws;

          // Handle terminal input
          term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'input', data }));
            }
          });

          // Handle terminal resize
          const handleResize = () => {
            fitAddon.fit();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'resize',
                  cols: term.cols,
                  rows: term.rows,
                })
              );
            }
          };

          window.addEventListener('resize', handleResize);

          return () => {
            window.removeEventListener('resize', handleResize);
          };
        }
      })
      .catch((error) => {
        console.error('Failed to create terminal session:', error);
        term.writeln('\x1b[31m✗ Failed to create terminal session\x1b[0m');
      });

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();

      // Close backend session (ignore 404 if already closed)
      fetch(`${API_URL}/api/terminal/${sessionId}`, {
        method: 'DELETE',
      }).catch(() => {
        // Session already cleaned up, ignore error
      });
    };
  }, [sessionId]);

  const extractTokenFromCLI = async () => {
    // Try to get token from terminal session (extracted from output)
    // This is a fallback - token should already be received via WebSocket
    try {
      const response = await fetch(`${API_URL}/api/terminal/${sessionId}/token`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.token && onTokenReceived) {
          onTokenReceived(data.token);
        }
      }
    } catch (error) {
      // Session likely already cleaned up, ignore error
    }
  };

  const handleClose = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'close' }));
      wsRef.current.close();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-4xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Claude Authentication Terminal</h2>
            {isConnected && (
              <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success">
                Connected
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="px-4 py-3 bg-info/10 border-b border-info/30 text-sm text-muted-foreground">
          <p>
            <strong className="text-info">Instructions:</strong> The terminal will run{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">claude login</code>.
            Click the authentication URL that appears, log in with your Claude.ai account, and the token will be saved automatically.
          </p>
        </div>

        {/* Terminal */}
        <div className="flex-1 p-4 overflow-hidden">
          <div
            ref={terminalRef}
            className="w-full h-full rounded-lg"
            style={{ backgroundColor: '#0B0B0F' }}
          />
        </div>
      </div>
    </div>
  );
}
