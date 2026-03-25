# Trophy Badge Art — Generation Guide

## Approach

- Generate subject images ONLY — no borders in the images
- Borders are CSS gradient rings + glow, rendered in code (see trophy-card.tsx)
- Background color matches the tier for visual cohesion with the ring
- Images are displayed as circles via CSS `rounded-full`
- No compositing script needed

## Prompt Rules

- Subject only — NO props, accessories, coins, crowns, tridents, etc.
- Natural environmental effects OK (water, fire, sparks) if they're part of the creature/thing
- Keep prompts short and focused on the subject itself
- No "with X" additions unless it's inherent (e.g. phoenix = fire is fine)

## Background Colors Per Tier

| Tier      | Background in prompt                          |
| --------- | --------------------------------------------- |
| green     | solid dark emerald background                 |
| blue      | solid dark navy blue background               |
| purple    | solid dark purple background                  |
| crimson   | solid dark crimson background                 |
| gold      | solid dark amber background                   |
| prismatic | solid dark background with faint rainbow tint |

## File Structure

Save images to:
  web/public/trophy-badges/[trophy-id]/[milestone-name].png
  e.g. web/public/trophy-badges/trading-volume/shark.png

Milestone name = lowercase, spaces replaced with hyphens.

---

## PROMPTS (84 total)

### Category 1: TRADING VOLUME (8)

Goldfish (green):
/imagine prompt: A tiny cute goldfish, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Minnow (green):
/imagine prompt: A small determined minnow fish swimming upward, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Swordfish (blue):
/imagine prompt: A sleek powerful swordfish cutting through water, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Shark (purple):
/imagine prompt: A fierce grinning shark with sharp teeth, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Orca (crimson):
/imagine prompt: A powerful orca breaching through a wave, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Whale (gold):
/imagine prompt: A massive blue whale diving gracefully with its tail flukes raised, steel blue skin, 3D clay render, centered composition, friendly cartoon style with expressive eyes, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Leviathan (prismatic):
/imagine prompt: A colossal sea serpent leviathan emerging from a whirlpool, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Kraken (prismatic):
/imagine prompt: A massive kraken with glowing tentacles, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 2: TRADES PLACED (7)

Rookie (green):
/imagine prompt: A single dartboard with one dart in the bullseye, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Dabbler (green):
/imagine prompt: A pair of dice mid-roll, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Regular (blue):
/imagine prompt: A rising bar chart with a glowing upward arrow, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Hustler (purple):
/imagine prompt: A stock ticker tape machine printing rapidly, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Machine (crimson):
/imagine prompt: A complex gear mechanism with interlocking cogs, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Terminator (gold):
/imagine prompt: A glowing red-eyed robot head, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Singularity (prismatic):
/imagine prompt: A swirling galaxy vortex, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 3: PREDICTION STREAK (9)

Spark (green):
/imagine prompt: A tiny flickering sparkle star, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Ember (blue):
/imagine prompt: A warm glowing ember coal, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Blaze (purple):
/imagine prompt: A roaring fireball erupting upward, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Inferno (crimson):
/imagine prompt: An erupting volcano with lava, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Phoenix (gold):
/imagine prompt: A majestic phoenix bird rising from flames with spread wings, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Eternal Flame (gold):
/imagine prompt: A radiant eternal sun with a flame corona, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Undying (prismatic):
/imagine prompt: An undying spirit flame floating in a cosmic void, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Timeless (prismatic):
/imagine prompt: An ancient hourglass frozen mid-flow with glowing sand, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Immortal (prismatic):
/imagine prompt: A cosmic flame with a starfield visible inside it, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 4: PROFITABLE MARKETS (8)

Lucky (green):
/imagine prompt: A glowing four-leaf clover, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Savvy (green):
/imagine prompt: A glowing brain, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Sharp (blue):
/imagine prompt: A sharp gleaming blade, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Tactician (blue):
/imagine prompt: A chess knight piece, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Oracle (purple):
/imagine prompt: A glowing crystal ball with swirling mist inside, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Sage (crimson):
/imagine prompt: A wise wizard with a long beard, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Clairvoyant (gold):
/imagine prompt: A mystical all-seeing eye, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Omniscient (prismatic):
/imagine prompt: A radiant cosmic star, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 5: MARKETS CREATED (9)

Apprentice (green):
/imagine prompt: A small hammer resting on an anvil, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Journeyman (green):
/imagine prompt: A wrench and toolbelt, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Builder (blue):
/imagine prompt: A construction crane, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Architect (blue):
/imagine prompt: A drafting compass and blueprint, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

City Planner (purple):
/imagine prompt: A miniature city skyline, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Visionary (crimson):
/imagine prompt: A telescope pointed at stars, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

World Builder (gold):
/imagine prompt: A glowing globe with continents lit up, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Titan of Questions (gold):
/imagine prompt: A towering mountain peak piercing through clouds, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Infinite Curiosity (prismatic):
/imagine prompt: A glowing infinity symbol, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 6: CREATOR POPULARITY (12)

Invisible (green):
/imagine prompt: A cute friendly ghost fading into mist, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Unknown (green):
/imagine prompt: A shadowy silhouette figure, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Recognized (green):
/imagine prompt: A friendly waving hand, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Notable (blue):
/imagine prompt: A group of small cartoon figures looking upward, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Popular (purple):
/imagine prompt: A megaphone broadcasting sound waves, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Famous (crimson):
/imagine prompt: A golden star on a stage, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Legendary (gold):
/imagine prompt: A gold medal on a ribbon, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Icon (gold):
/imagine prompt: A film clapperboard, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Celebrity (gold):
/imagine prompt: A royal crown with jewels, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Superstar (prismatic):
/imagine prompt: A shooting comet with a dazzling trail, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Phenomenon (prismatic):
/imagine prompt: A meteor shower across a night sky, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Transcendent (prismatic):
/imagine prompt: A spiral galaxy with a glowing center, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 7: COMMENTS (8)

Chatterbox (green):
/imagine prompt: A speech bubble, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Conversationalist (green):
/imagine prompt: A thought cloud bubble with a lightbulb inside, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Debater (blue):
/imagine prompt: A shouting face silhouette with sound waves, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Commentator (purple):
/imagine prompt: A notepad with a pen, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Pundit (crimson):
/imagine prompt: A bullhorn megaphone, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Influencer (gold):
/imagine prompt: A newspaper front page, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Thought Leader (gold):
/imagine prompt: A glowing lightbulb, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Voice of the People (prismatic):
/imagine prompt: A vintage microphone on a stage, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 8: REFERRALS (9)

Networker (green):
/imagine prompt: Two hands shaking in a handshake, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Connector (blue):
/imagine prompt: A chain link connecting two glowing nodes, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Recruiter (purple):
/imagine prompt: An envelope with a glowing letter emerging, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Ambassador (crimson):
/imagine prompt: A knight on horseback, 3D clay render, centered composition, friendly cartoon style, solid dark crimson background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Evangelist (gold):
/imagine prompt: A satellite dish broadcasting signal beams, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Pied Piper (gold):
/imagine prompt: A magical flute with musical notes spiraling, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Kingmaker (prismatic):
/imagine prompt: A magic wand with sparkles, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Movement Leader (prismatic):
/imagine prompt: A checkered racing flag waving, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Founding Force (prismatic):
/imagine prompt: A lightning bolt striking, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 9: LEGACY CHARITY (5)

Donor (green):
/imagine prompt: A green heart with a gentle glow, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Patron (blue):
/imagine prompt: A purple heart, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Philanthropist (purple):
/imagine prompt: A red heart with radiating warmth, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Benefactor (gold):
/imagine prompt: A sparkling golden heart, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Saint (prismatic):
/imagine prompt: An angelic heart with a halo and tiny wings, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 10: MASTERS SEASONS (4)

Contender (blue):
/imagine prompt: A boxing glove, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Champion (purple):
/imagine prompt: A golden trophy cup, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Dynasty (gold):
/imagine prompt: A grand castle fortress with banners, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

GOAT (prismatic):
/imagine prompt: A cute cartoon goat standing on a mountain peak, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

### Category 11: ACCOUNT AGE (5)

Newcomer (green):
/imagine prompt: A tiny green seedling sprouting from soil, 3D clay render, centered composition, friendly cartoon style, solid dark emerald background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Established (blue):
/imagine prompt: A strong tree with a full green canopy, 3D clay render, centered composition, friendly cartoon style, solid dark navy blue background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Veteran (purple):
/imagine prompt: A military medal with a star, 3D clay render, centered composition, friendly cartoon style, solid dark purple background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Elder (gold):
/imagine prompt: A wise elder figure with a long white beard, 3D clay render, centered composition, friendly cartoon style, solid dark amber background, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250

Founding Member (prismatic):
/imagine prompt: A grand classical temple with marble pillars, 3D clay render, centered composition, friendly cartoon style, solid dark background with faint rainbow tint, soft studio lighting, no border, no frame, no text --ar 1:1 --v 6.1 --s 250
