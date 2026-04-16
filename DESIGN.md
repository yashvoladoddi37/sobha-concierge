# SobhaBot Design System
## Adapted from Intercom's conversational UI patterns for luxury residential context

## 1. Visual Theme & Atmosphere

**Concept: "Digital Concierge"** — A premium residential assistant that feels like the lobby of a luxury apartment. Warm, approachable, trustworthy. Not corporate, not playful — refined and residential.

The interface operates on a warm ivory canvas (`#FAF8F5`) with deep charcoal text (`#1C1917`), creating an intimate, high-end reading experience. The signature Sobha Emerald (`#2D6A4F`) — inspired by Sobha Ltd's brand green — serves as the primary accent, conveying trust, nature, and premium quality. A warm gold (`#B7872F`) provides a secondary accent for highlights and important callouts.

**Key Characteristics:**
- Warm ivory canvas (`#FAF8F5`) with sandstone borders (`#E7E0D8`)
- DM Sans for clean, geometric headings with moderate negative tracking
- Lora serif for editorial moments (source citations, legal references)
- Sobha Emerald (`#2D6A4F`) as primary accent — trust, nature, premium
- Warm Gold (`#B7872F`) for secondary accents and highlights
- 8px border-radius on cards, 6px on buttons — soft but not bubbly
- Subtle shadow elevation instead of harsh borders
- Mobile-first: 90%+ of users will be on phones

## 2. Color Palette & Roles

### Primary
- **Deep Charcoal** (`#1C1917`): Primary text, headings
- **Ivory** (`#FAF8F5`): Page background, canvas
- **Warm White** (`#FFFFFF`): Cards, chat bubbles (user)
- **Sobha Emerald** (`#2D6A4F`): Primary accent, bot avatar, CTAs
- **Sobha Emerald Light** (`#EBF5F0`): Bot message bubbles, success states
- **Warm Gold** (`#B7872F`): Secondary accent, citation badges, highlights

### Neutral Scale (Warm Stone)
- **Stone 900** (`#1C1917`): Primary text
- **Stone 700** (`#44403C`): Secondary text
- **Stone 500** (`#78716C`): Muted text, timestamps
- **Stone 400** (`#A8A29E`): Placeholder text
- **Stone 300** (`#D6D3D1`): Subtle borders
- **Stone 200** (`#E7E5E4`): Dividers
- **Stone 100** (`#F5F5F4`): Subtle backgrounds
- **Sandstone** (`#E7E0D8`): Primary border color (warm)

### Semantic
- **Error** (`#DC2626`): Error states
- **Warning Gold** (`#D97706`): Warnings, pending states
- **Success** (`#16A34A`): Success confirmations
- **Info Blue** (`#2563EB`): Information, links to legal docs

## 3. Typography Rules

### Font Families
- **Primary (Headings + UI)**: `"DM Sans", system-ui, -apple-system, sans-serif`
- **Serif (Citations + Legal)**: `"Lora", Georgia, "Times New Roman", serif`
- **Monospace (Technical)**: `"JetBrains Mono", "Fira Code", ui-monospace, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Page Title | DM Sans | 32px | 700 | 1.1 | -0.5px |
| Section Heading | DM Sans | 24px | 600 | 1.2 | -0.3px |
| Card Title | DM Sans | 18px | 600 | 1.3 | -0.2px |
| Body | DM Sans | 15px | 400 | 1.6 | normal |
| Body Small | DM Sans | 13px | 400 | 1.5 | normal |
| Chat Message | DM Sans | 15px | 400 | 1.6 | normal |
| Citation | Lora | 13px | 400 | 1.4 | normal |
| Source Badge | DM Sans | 11px | 500 | 1.0 | 0.3px uppercase |
| Timestamp | DM Sans | 12px | 400 | 1.0 | normal |
| Button | DM Sans | 14px | 500 | 1.0 | normal |

## 4. Component Stylings

### Chat Message — Bot
- Background: `#EBF5F0` (emerald tint)
- Text: `#1C1917`
- Border: none
- Radius: 2px 16px 16px 16px (tail on top-left)
- Padding: 14px 16px
- Max width: 85% of container

### Chat Message — User
- Background: `#1C1917` (deep charcoal)
- Text: `#FFFFFF`
- Border: none
- Radius: 16px 16px 2px 16px (tail on bottom-right)
- Padding: 14px 16px
- Max width: 85% of container

### Citation Badge
- Background: `#FDF8EF` (warm gold tint)
- Text: `#B7872F`
- Border: `1px solid #E8D5B0`
- Radius: 4px
- Padding: 2px 8px
- Font: Lora 13px italic

### Source Panel (expandable below bot message)
- Background: `#F5F5F4`
- Border: `1px solid #E7E5E4`
- Radius: 8px
- Contains: document name, section, page number

### Suggested Question Chips
- Background: `#FFFFFF`
- Text: `#2D6A4F`
- Border: `1px solid #D6D3D1`
- Radius: 20px (pill)
- Padding: 8px 16px
- Hover: background `#EBF5F0`, border `#2D6A4F`
- Font: DM Sans 14px weight 400

### Input Area
- Background: `#FFFFFF`
- Border: `1.5px solid #E7E0D8`
- Radius: 12px
- Padding: 12px 16px
- Focus: border `#2D6A4F`, shadow `0 0 0 3px rgba(45, 106, 79, 0.1)`
- Placeholder: `#A8A29E` "Ask about bylaws, meetings, penalties..."

### Send Button
- Background: `#2D6A4F`
- Icon: white arrow
- Radius: 8px
- Size: 40px x 40px
- Hover: `#235C42`
- Disabled: `#D6D3D1`

### Header Bar
- Background: `#FFFFFF`
- Border bottom: `1px solid #E7E0D8`
- Height: 64px
- Contains: Sobha Indraprastha logo/name, "SobhaBot" label
- Shadow: `0 1px 3px rgba(0,0,0,0.04)`

### Welcome Screen (first visit)
- Large Sobha Emerald icon/avatar
- "Welcome to SobhaBot" — DM Sans 32px 700
- "Your AI assistant for Sobha Indraprastha" — DM Sans 15px Stone 500
- 4-6 suggested question chips arranged in 2-column grid on mobile

## 5. Layout Principles

### Spacing Scale
4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px

### Border Radius
- Buttons: 6px
- Cards/Panels: 8px
- Chat bubbles: 16px (with 2px tail corner)
- Input field: 12px
- Pills/chips: 20px
- Avatar: 50% (circle)

### Mobile Layout (primary)
- Full viewport height chat
- Input pinned to bottom with safe-area padding
- Messages scroll area fills remaining space
- No sidebar — single column
- Suggested questions wrap naturally

### Desktop Layout
- Max width: 720px centered
- Optional subtle side margins with decorative pattern
- Same single-column chat layout

## 6. Depth & Elevation
- **Level 0**: Flat (chat bubbles, badges)
- **Level 1**: `0 1px 3px rgba(0,0,0,0.04)` (header, input area)
- **Level 2**: `0 4px 12px rgba(0,0,0,0.06)` (floating elements, modals)
- **Level 3**: `0 8px 24px rgba(0,0,0,0.08)` (popovers, tooltips)

## 7. Micro-interactions
- Message appear: fade in + slide up 8px, 200ms ease-out
- Typing indicator: 3 dots with staggered pulse animation
- Send button: scale(0.95) on press, spring back
- Citation expand: smooth height transition 200ms
- Suggested chips: subtle scale(1.02) on hover
- Scroll to bottom: smooth scroll behavior

## 8. Do's and Don'ts

### Do
- Use warm ivory and sandstone — this is a home, not an office
- Show source citations for every factual answer
- Keep chat bubbles generous in padding — not cramped
- Use Lora serif for document citations — adds editorial authority
- Pin input to bottom on mobile with proper safe area

### Don't
- Don't use cool grays — always warm stone tones
- Don't use Sobha Emerald for large surfaces — accent only
- Don't make the UI feel like a developer tool
- Don't show raw document text — always format responses naturally
- Don't use more than 2 lines for suggested question chips
