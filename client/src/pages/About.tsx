/**
 * CHARLOTTE'S HW TRACKER — About Page
 * Periwinkle Dream: story behind the app, animated cat sequence, author intro
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import Layout from "@/components/Layout";

// Three-frame cat animation: doing homework → celebrating → using tracker
const CAT_FRAMES = [
  {
    src: "https://d2xsxph8kpxj0f.cloudfront.net/310519663338750515/bzdjJbT6qtessyzYC3QCNU/anim_frame1_homework-L4zz6jiVCrNJCq2ufWY2Gu.webp",
    caption: "Step 1 — Charlotte does her homework every day 📝",
    bg: "rgba(196,191,238,0.18)",
  },
  {
    src: "https://d2xsxph8kpxj0f.cloudfront.net/310519663338750515/bzdjJbT6qtessyzYC3QCNU/anim_frame2_done-Sm7V39r2DrwmRKAZKhH9N3.webp",
    caption: "Step 2 — She finishes and feels super proud! ✨",
    bg: "rgba(181,234,215,0.18)",
  },
  {
    src: "https://d2xsxph8kpxj0f.cloudfront.net/310519663338750515/bzdjJbT6qtessyzYC3QCNU/anim_frame3_tracker-duUCHKWr2BeXog6pgyDaro.webp",
    caption: "Step 3 — She logs it here and watches her rewards grow! 💰",
    bg: "rgba(255,214,176,0.18)",
  },
];

const TIMELINE = [
  { year: "April 2023", event: "The homework tracker journey begins! Charlotte starts logging daily homework.", emoji: "🌱" },
  { year: "Summer 2023", event: "First big reward spent — a well-earned treat after months of hard work.", emoji: "🎉" },
  { year: "2024", event: "Over 300 days of consistent homework tracking. Cello and Chinese become favourites.", emoji: "🎻" },
  { year: "Early 2025", event: "The paper tracker gets a digital upgrade — this website is born!", emoji: "💻" },
  { year: "April 2026", event: "1,000+ days logged, $5,000+ earned in rewards. Still going strong! 🐱", emoji: "🏆" },
];

export default function About() {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Auto-advance frames every 2.5 seconds
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % CAT_FRAMES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [playing]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="text-center mb-10">
          <motion.h1
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-brand text-4xl mb-2"
            style={{ color: '#3d3580' }}
          >
            About This Tracker 🐱
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="font-body text-base"
            style={{ color: '#6b63b5' }}
          >
            A little story about homework, rewards, and a very determined girl.
          </motion.p>
        </div>

        {/* ── Cat Animation ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 mb-8"
        >
          <h2 className="font-display font-bold text-base mb-4 text-center" style={{ color: '#3d3580' }}>
            🎬 How It Works
          </h2>

          {/* Frame display */}
          <div
            className="relative rounded-2xl overflow-hidden mb-4 flex items-center justify-center"
            style={{
              background: CAT_FRAMES[frame].bg,
              minHeight: 280,
              transition: 'background 0.6s ease',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={frame}
                src={CAT_FRAMES[frame].src}
                alt={CAT_FRAMES[frame].caption}
                initial={{ opacity: 0, scale: 0.88, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.06, y: -12 }}
                transition={{ duration: 0.45 }}
                className="w-56 h-56 object-contain drop-shadow-lg"
              />
            </AnimatePresence>

            {/* Step indicator dots */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
              {CAT_FRAMES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setFrame(i); setPlaying(false); }}
                  className="rounded-full transition-all"
                  style={{
                    width: i === frame ? 20 : 8,
                    height: 8,
                    background: i === frame ? '#8b83c5' : 'rgba(139,131,197,0.3)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Caption */}
          <AnimatePresence mode="wait">
            <motion.p
              key={frame}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="font-body text-sm text-center font-semibold"
              style={{ color: '#5a5490' }}
            >
              {CAT_FRAMES[frame].caption}
            </motion.p>
          </AnimatePresence>

          {/* Play/pause + manual nav */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setFrame(f => (f - 1 + CAT_FRAMES.length) % CAT_FRAMES.length)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all hover:scale-110"
              style={{ background: 'rgba(139,131,197,0.12)', color: '#6b63b5' }}
            >
              ◀
            </button>
            <button
              onClick={() => setPlaying(p => !p)}
              className="px-4 py-2 rounded-2xl text-xs font-bold font-display transition-all"
              style={{
                background: playing ? 'linear-gradient(135deg, #8b83c5, #a89fd4)' : 'rgba(139,131,197,0.12)',
                color: playing ? 'white' : '#6b63b5',
              }}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              onClick={() => setFrame(f => (f + 1) % CAT_FRAMES.length)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all hover:scale-110"
              style={{ background: 'rgba(139,131,197,0.12)', color: '#6b63b5' }}
            >
              ▶
            </button>
          </div>
        </motion.div>

        {/* ── Why We Made This ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 mb-6"
        >
          <h2 className="font-display font-bold text-lg mb-3" style={{ color: '#3d3580' }}>
            💜 Why We Made This
          </h2>
          <p className="font-body text-sm leading-relaxed mb-3" style={{ color: '#4a4080' }}>
            Every great habit starts with a small decision. For Charlotte, that decision was to track her homework every single day — not because someone forced her to, but because she discovered that hard work has real, tangible rewards.
          </p>
          <p className="font-body text-sm leading-relaxed mb-3" style={{ color: '#4a4080' }}>
            This tracker was born from a simple spreadsheet that grew into something much bigger: a record of over <strong>1,000 days</strong> of dedication, learning, and growth. Chinese lessons, cello practice, math problems, reading chapters — every task checked off is a small victory worth celebrating.
          </p>
          <p className="font-body text-sm leading-relaxed" style={{ color: '#4a4080' }}>
            The reward system turns homework into something exciting — each completed task earns real money that Charlotte can save and spend on things she loves. It's not just about homework. It's about building the habit of showing up, every day, even when it's hard. 🌟
          </p>
        </motion.div>

        {/* ── Journey Timeline ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 mb-6"
        >
          <h2 className="font-display font-bold text-lg mb-5" style={{ color: '#3d3580' }}>
            🗓️ Charlotte's Journey
          </h2>
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-5 top-0 bottom-0 w-0.5"
              style={{ background: 'rgba(139,131,197,0.25)' }}
            />
            <div className="space-y-5">
              {TIMELINE.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.07 }}
                  className="flex gap-4 relative"
                >
                  {/* Dot */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 z-10"
                    style={{ background: 'rgba(196,191,238,0.4)', border: '2px solid rgba(139,131,197,0.4)' }}
                  >
                    {item.emoji}
                  </div>
                  <div className="pt-1.5">
                    <div className="font-display font-bold text-sm mb-0.5" style={{ color: '#5a5490' }}>
                      {item.year}
                    </div>
                    <div className="font-body text-sm" style={{ color: '#4a4080' }}>
                      {item.event}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── About the Author ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6 mb-6"
        >
          <h2 className="font-display font-bold text-lg mb-4" style={{ color: '#3d3580' }}>
            🐱 About Charlotte
          </h2>
          <div className="flex gap-4 items-start">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(196,191,238,0.4), rgba(181,234,215,0.3))' }}
            >
              👧
            </div>
            <div>
              <p className="font-body text-sm leading-relaxed mb-2" style={{ color: '#4a4080' }}>
                Hi! I'm <strong>Charlotte</strong>, a student who loves music, languages, and learning new things. I play the cello 🎻, study Chinese 🈶, and read as many books as I can get my hands on 📚.
              </p>
              <p className="font-body text-sm leading-relaxed mb-2" style={{ color: '#4a4080' }}>
                I started this tracker because I wanted to see my progress over time and have something to show for all my hard work. Turns out, tracking things is actually really fun — especially when there's a reward at the end! 🎁
              </p>
              <p className="font-body text-sm leading-relaxed" style={{ color: '#4a4080' }}>
                My favourite things: cats 🐱, periwinkle purple, cozy study sessions, and spending my hard-earned rewards on things I love. ✨
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center pb-4"
        >
          <p className="font-body text-sm mb-4" style={{ color: '#6b63b5' }}>
            Ready to keep the streak going? 🔥
          </p>
          <Link href="/log">
            <button className="btn-periwinkle text-sm px-8">
              ✏️ Log Today's Homework
            </button>
          </Link>
        </motion.div>

      </div>
    </Layout>
  );
}
