import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from './ui/button';
import { X, Terminal as TerminalIcon, CheckCircle2 } from 'lucide-react';
import { API_URL, httpToWs } from '../lib/url-utils';

interface GitHubAuthTerminalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Terminal component for running `gh auth login` in the backend container.
 * Connects to backend PTY service via WebSocket for full interactive support.
 */
export function GitHubAuthTerminal({ onClose, onSuccess }: GitHubAuthTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId] = useState(`gh-auth-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);
  const [authCompleted, setAuthCompleted] = useState(false);

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

    // Command to run - skip prompts where possible
    const command = encodeURIComponent('gh auth login --hostname github.com --git-protocol https --web');

    // Create backend PTY session
    fetch(`${API_URL}/api/terminal/create/${sessionId}?auto_run=${command}`, {
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
            term.writeln('\x1b[36mRunning: gh auth login\x1b[0m');
            term.writeln('\x1b[33mFollow the prompts to authenticate with GitHub\x1b[0m');
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
            const data = JSON.parse(event.data);
            if (data.type === 'output') {
              term.write(data.data);

              // Check for success message - look for various success indicators
              if (data.data.includes('Logged in as') ||
                  data.data.includes('Authentication complete') ||
                  data.data.includes('Configured git protocol')) {
                setAuthCompleted(true);
              }
            } else if (data.type === 'exit') {
              term.writeln('');
              if (data.code === 0) {
                term.writeln('\x1b[32m✓ GitHub authentication completed!\x1b[0m');
                setAuthCompleted(true);
              } else {
                term.writeln(`\x1b[31mProcess exited with code ${data.code}\x1b[0m`);
              }
            }
          };

          ws.onclose = () => {
            setIsConnected(false);
            term.writeln('\x1b[33mTerminal disconnected\x1b[0m');
          };

          ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            term.writeln('\x1b[31mConnection error\x1b[0m');
          };

          // Handle terminal input
          term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'input', data }));
            }
          });

          wsRef.current = ws;
        } else {
          term.writeln('\x1b[31mFailed to create terminal session\x1b[0m');
        }
      })
      .catch((err) => {
        console.error('Failed to create terminal:', err);
        term.writeln('\x1b[31mFailed to connect to backend\x1b[0m');
      });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: 'resize',
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            })
          );
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
      // Cleanup session
      fetch(`${API_URL}/api/terminal/close/${sessionId}`, { method: 'POST' }).catch(() => {});
    };
  }, [sessionId]);

  const handleDone = () => {
    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GitHub Authentication</span>
          {isConnected && (
            <span className="text-xs text-green-500">● Connected</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={terminalRef} className="flex-1 p-2 bg-[#0B0B0F]" />

      {authCompleted && (
        <div className="p-3 border-t border-border bg-success/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Authentication successful!</span>
          </div>
          <Button onClick={handleDone} size="sm">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
