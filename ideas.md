# Meow's HW Tracker — Design Brainstorm

## Chosen Design: Pastel Dream (Option A) with Cat Theme

### Design Movement
Kawaii Stationery / Soft Pastel Journaling — inspired by Japanese stationery culture, cute planner aesthetics, and cozy bedroom vibes for a teen girl.

### Core Principles
1. **Warmth over sterility** — every element should feel hand-crafted, cozy, and personal
2. **Playful but functional** — cat motifs and sparkles enhance, never obstruct, usability
3. **Gentle hierarchy** — soft shadows and pastel tints guide the eye without harsh contrast
4. **Rewarding feedback** — micro-animations celebrate progress and make homework feel like a game

### Color Philosophy
- Background: warm blush-to-lavender gradient `#FFF0F5` → `#F0E6FF`
- Primary accent: soft rose pink `#F9A8C9`
- Secondary accent: mint green `#B5EAD7`
- Tertiary: soft lavender `#D4B8F0`
- Card backgrounds: translucent white `rgba(255,255,255,0.75)` with frosted glass
- Text: warm dark brown `#4A3728` (not harsh black)
- Gold for rewards: `#F5C842`

### Layout Paradigm
- Top navigation bar with logo + page tabs (not a sidebar)
- Main content uses an asymmetric two-column layout on desktop: wide left column for tasks, narrow right column for rewards/streak
- Mobile: single column, cards stack vertically
- Dashboard uses a masonry-inspired card grid

### Signature Elements
1. **Cat paw print dividers** between sections
2. **Kawaii cat coin jar** as the reward balance display
3. **Cat face stickers** on completed days in the streak calendar

### Interaction Philosophy
- Checkbox toggles animate with a little bounce + sparkle burst
- Reward balance counter animates (count up) when points are added
- Hover on task cards lifts them with a soft shadow
- Page transitions use a gentle fade-slide

### Animation
- `framer-motion` for card entrances (stagger fade-up)
- Checkbox completion: scale bounce + confetti sparkle
- Reward jar: coin drop animation when balance increases
- Streak calendar: cat face pops in with a scale spring

### Typography System
- Display/Title: **Nunito** (rounded, friendly, bubbly) — headings
- Body: **Quicksand** (clean, rounded, readable) — body text
- Accent: **Pacifico** — used only for the logo/brand name
- Hierarchy: 32px title → 20px section headers → 15px body → 12px labels
