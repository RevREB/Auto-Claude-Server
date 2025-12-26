import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

// The version baked into this build at compile time
const CURRENT_VERSION = __BUILD_VERSION__;

// Check interval in milliseconds (15 seconds)
const CHECK_INTERVAL = 15 * 1000;

export function VersionCheck() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  useEffect(() => {
    console.log('[VersionCheck] Current build version:', CURRENT_VERSION);

    const checkVersion = async () => {
      try {
        // Add cache-busting query param to bypass browser cache
        const response = await fetch(`/version.json?_=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();

          if (data.version !== CURRENT_VERSION) {
            console.log('[VersionCheck] New version available!', {
              current: CURRENT_VERSION,
              server: data.version,
            });
            setServerVersion(data.version);
            setNewVersionAvailable(true);
          }
        }
      } catch (err) {
        // Silently ignore errors (e.g., network issues)
        console.debug('[VersionCheck] Failed to check version:', err);
      }
    };

    // Check immediately on mount
    checkVersion();

    // Then check periodically
    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const handleReload = () => {
    // Force reload from server, bypassing cache
    window.location.reload();
  };

  if (!newVersionAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-sm">
        <RefreshCw className="h-5 w-5 animate-spin-slow" />
        <div className="flex-1">
          <p className="font-medium text-sm">New version available</p>
          <p className="text-xs opacity-90">Reload to get the latest updates</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleReload}
          className="shrink-0"
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
