/**
 * CHARLOTTE'S HW TRACKER — Layout Component
 * Periwinkle Dream: shared nav, header, and page wrapper
 *
 * Navbar design: compact emoji-only icons on md (768-1023px), full labels on lg (1024px+).
 * iPad Pro is 1024px wide — uses lg breakpoint for full labels.
 * Mobile (<768px): hamburger menu.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { href: '/', label: 'Home', emoji: '🏠' },
  { href: '/log', label: 'Log Today', emoji: '✏️' },
  { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
  { href: '/history', label: 'History', emoji: '📅' },
  { href: '/rewards', label: 'Rewards', emoji: '💰' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
  { href: '/about', label: 'About', emoji: '🐱' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1.5px solid rgba(139,131,197,0.2)',
          boxShadow: '0 2px 16px rgba(139,131,197,0.10)',
        }}
      >
        <div className="flex items-center justify-between h-14 px-3 md:px-4 lg:px-6 max-w-[1280px] mx-auto">
          {/* Logo — shorter on smaller screens */}
          <Link href="/">
            <div className="flex items-center gap-1.5 cursor-pointer group flex-shrink-0">
              <img
                src="/manus-storage/cat_logo_golden_2ef59134.png"
                alt="Charlotte"
                className="w-8 h-8 lg:w-10 lg:h-10 object-contain group-hover:scale-110 transition-transform"
              />
              {/* Full brand name only on lg+ */}
              <span className="font-brand text-base lg:text-xl hidden sm:block" style={{ color: '#5a5490' }}>
                <span className="hidden lg:inline">Charlotte's HW Tracker</span>
                <span className="lg:hidden">Charlotte's HW</span>
              </span>
            </div>
          </Link>

          {/* Desktop/tablet nav — shown at md (768px+) */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <span
                    className="flex items-center gap-1 rounded-xl font-bold font-display transition-all cursor-pointer whitespace-nowrap"
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.8rem',
                      background: isActive
                        ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                        : 'transparent',
                      color: isActive ? 'white' : '#5a5490',
                      boxShadow: isActive ? '0 3px 10px rgba(139,131,197,0.3)' : 'none',
                    }}
                  >
                    {/* On md show emoji only; on lg show emoji + label */}
                    <span>{item.emoji}</span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-xl"
            style={{ background: 'rgba(139,131,197,0.12)' }}
            onClick={() => setMobileOpen(v => !v)}
          >
            <span className="text-xl">{mobileOpen ? '✕' : '☰'}</span>
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden"
              style={{ borderTop: '1px solid rgba(139,131,197,0.15)' }}
            >
              <div className="px-3 py-3 flex flex-col gap-1">
                {NAV_ITEMS.map(item => {
                  const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
                  return (
                    <Link key={item.href} href={item.href}>
                      <span
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-2 rounded-xl text-sm font-bold font-display cursor-pointer"
                        style={{
                          background: isActive ? 'linear-gradient(135deg, #8b83c5, #a89fd4)' : 'rgba(139,131,197,0.08)',
                          color: isActive ? 'white' : '#5a5490',
                        }}
                      >
                        {item.emoji} {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Page content */}
      <main className="flex-1 px-3 md:px-4 lg:px-6 py-6 max-w-[1280px] mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center font-body text-xs" style={{ color: '#8b83c5' }}>
        Made with 🐱 love for Charlotte ✨
      </footer>
    </div>
  );
}
