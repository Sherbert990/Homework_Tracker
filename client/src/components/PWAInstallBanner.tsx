import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed (running as standalone PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    // Capture the install prompt (Chrome/Android only — not available on iOS)
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
  };

  if (isInstalled) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)' }}>
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-bold text-green-800 text-sm">App installed!</p>
          <p className="text-green-700 text-xs">Running as a full-screen app on this device.</p>
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'linear-gradient(135deg, #f3f0ff, #e8e4ff)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <div>
            <p className="font-bold text-purple-800 text-sm">Add to iPad Home Screen</p>
            <p className="text-purple-600 text-xs">Install as an app for the best experience</p>
          </div>
          <button
            onClick={() => setShowIOSInstructions(!showIOSInstructions)}
            className="ml-auto text-xs font-semibold text-purple-700 underline"
          >
            {showIOSInstructions ? 'Hide' : 'How?'}
          </button>
        </div>
        {showIOSInstructions && (
          <div className="bg-white rounded-xl p-3 space-y-2 text-sm text-gray-700">
            <p className="font-semibold text-purple-800">Steps to install on iPad:</p>
            <ol className="space-y-1 list-decimal list-inside text-xs">
              <li>Open this website in <strong>Safari</strong> (not Chrome)</li>
              <li>Tap the <strong>Share button</strong> <span className="text-lg">⎋</span> at the top of Safari</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top-right corner</li>
              <li>Find the 🐱 cat icon on your home screen and tap it!</li>
            </ol>
            <p className="text-xs text-gray-500 mt-2">
              Once installed, the app opens full-screen with no Safari address bar, works offline, and can send reminder notifications.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (installPrompt) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #f3f0ff, #e8e4ff)' }}>
        <span className="text-2xl">📲</span>
        <div className="flex-1">
          <p className="font-bold text-purple-800 text-sm">Install as an App</p>
          <p className="text-purple-600 text-xs">Add to home screen for full-screen access and offline support</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #7a82c8, #9b8fd4)' }}
        >
          Install
        </button>
      </div>
    );
  }

  // Browser doesn't support install prompt (e.g. Firefox desktop)
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: 'linear-gradient(135deg, #f5f5f5, #eeeeee)' }}>
      <span className="text-2xl">🌐</span>
      <div>
        <p className="font-bold text-gray-700 text-sm">PWA Ready</p>
        <p className="text-gray-500 text-xs">
          Service worker active — offline caching enabled. For the best experience, open in Safari on iPad and add to home screen.
        </p>
      </div>
    </div>
  );
}
