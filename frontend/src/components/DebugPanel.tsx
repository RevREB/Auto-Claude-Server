import { useEffect, useState } from 'react';

export function DebugPanel() {
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    const collectDebugInfo = () => {
      const main = document.querySelector('main');
      const kanbanContainer = document.querySelector('[class*="flex h-full flex-col bg-background"]');
      const columnsContainer = document.querySelector('[class*="flex flex-1 gap-4"]');
      const columns = document.querySelectorAll('[class*="w-72 shrink-0"]');

      const info = {
        timestamp: new Date().toISOString(),
        main: main ? {
          className: main.className,
          display: getComputedStyle(main).display,
          flexDirection: getComputedStyle(main).flexDirection,
          width: getComputedStyle(main).width,
          height: getComputedStyle(main).height,
          overflow: getComputedStyle(main).overflow,
        } : 'NOT FOUND',
        kanbanContainer: kanbanContainer ? {
          className: kanbanContainer.className,
          display: getComputedStyle(kanbanContainer).display,
          flexDirection: getComputedStyle(kanbanContainer).flexDirection,
          width: getComputedStyle(kanbanContainer).width,
          height: getComputedStyle(kanbanContainer).height,
        } : 'NOT FOUND',
        columnsContainer: columnsContainer ? {
          className: columnsContainer.className,
          display: getComputedStyle(columnsContainer).display,
          flexDirection: getComputedStyle(columnsContainer).flexDirection,
          width: getComputedStyle(columnsContainer).width,
          childCount: columnsContainer.children.length,
        } : 'NOT FOUND',
        columns: {
          count: columns.length,
          samples: Array.from(columns).slice(0, 2).map((col, i) => ({
            index: i,
            className: col.className,
            width: getComputedStyle(col).width,
            display: getComputedStyle(col).display,
            flexShrink: getComputedStyle(col).flexShrink,
          }))
        },
        tailwindLoaded: !!document.querySelector('style[data-vite-dev-id]') || !!document.querySelector('link[href*="index"]'),
      };

      setDebugInfo(info);
      console.log('[DEBUG PANEL]', info);
    };

    // Collect immediately and after a delay to catch post-render state
    collectDebugInfo();
    const timer = setTimeout(collectDebugInfo, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '400px',
        maxHeight: '50vh',
        overflow: 'auto',
        backgroundColor: '#000',
        color: '#0f0',
        padding: '10px',
        fontSize: '10px',
        fontFamily: 'monospace',
        zIndex: 9999,
        border: '2px solid #0f0',
      }}
    >
      <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '12px' }}>
        🐛 DEBUG PANEL
      </div>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </div>
  );
}
