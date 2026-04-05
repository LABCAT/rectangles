---
name: social-media-captions
description: >-
  Generate captivating social media captions for creative coding animations,
  tailored to Instagram and Threads — audio-reactive, generative, MIDI-driven
  visual art. Interview the artist first (unless they explicitly skip); only
  then draft the caption. Use when the user wants to write a caption, post, or
  social copy for their animation work, even if they only say something like
  "caption for this," "post this," "write something for insta," or mention
  sharing their work online.
---

# Social Media Captions

Generate captions for Instagram and Threads that showcase creative coding
animations — audio-reactive, generative, MIDI-driven visual art.

## Workflow

**Order is mandatory.** Complete each step before starting the next. Do **not**
write the caption body (hook through tech footer), do **not** output the
`## Caption` block, and do **not** run character-count verification until
**step 2 is done** — either the user has answered your interview (enough to
write faithfully to the piece), or they **explicitly** waive it with clear
phrasing such as “skip the interview,” “infer from code only,” or “draft
without asking me.” Vague requests like “caption for this” or “run the skill”
still require the interview first.

### 1. Gather context

Read the sketch code the user points you to (or the currently open file). Extract:

- The sketch name/number (e.g. `#CirclesNo9`)
- Visual elements (shapes, geometry, colors, effects)
- Audio/music relationship (audio-reactive, MIDI-synced, which instruments)
- Technologies used (p5js, WebGL, ToneJS, etc.)
- Any thematic through-line (sacred geometry, cosmos, psychedelia, etc.)

Use code to **ground** details, not to **dictate wording**. Implementation
terms (FFT, MIDI tracks, gates, ADD blend, cue indices) belong in READMEs —
the caption should read like **motion, color, and feeling** unless the artist
explicitly wants a technical voice.

### 2. Interview the user

The code won't tell you everything. Ask about details you can't infer:

- **What does it look like in motion?** Colors shifting, particles flowing, shapes morphing — the code tells you what's possible, but the user knows what's actually happening in the final render.
- **What's the mood/feeling?** Meditative, energetic, dark, euphoric, cosmic?
- **What music genre/vibe?** Hip-hop, ambient, electronic, funk?
- **Any specific theme** they want to emphasize?
- **Is there a quote** they want to include, or should you suggest one?

Keep it conversational — don't dump all questions at once. Ask what feels
missing after reading the code.

**End this step with questions only** (plus a one-line summary of what you
inferred from code if helpful). Wait for the user’s reply before proceeding
unless they have already waived the interview in this thread.

If the user says they want to **keep** a specific hook, quote, and/or the
canonical tech footer, treat those lines as **fixed** in the next step —
revise only what they ask you to (usually the sketch description block and/or
the `#AudioReactive` closing), and **do not** swap fixed lines for “variety.”

### 3. Generate the caption

**Only after step 2.** Follow the structure and style below. Produce **one**
caption that satisfies both Instagram and the Threads **500-character** limit
(same text for both).

## Caption anatomy

Every caption follows this structure (order can flex slightly):

```
[Opening hook — one evocative line + emojis]

[Sketch hashtag + description block — what the viewer is seeing, rich with
 inline #Hashtags and emojis. This is the heart of the caption.]

[Quote — always attributed, always relevant. Followed by emoji(s).]

[Closing line — ties the visual/audio experience together with
 #AudioReactive and #GenerativeArt hashtags woven in.]

[Tech footer — credits the tools used]
```

### Opening hook

A single punchy line that pulls the viewer in. Poetic, mysterious, or bold.
Bookended with 1–2 emojis.

**Examples:**
- `Breakbeats twist into symmetry. 🍩💫`
- `🌌 When darkness reveals the light and sound paints the cosmos! 🎧`
- `Unveil the hidden frequency of the universe. 🗝️`
- `🌌 The Visible Spectrum of Rhythm 🌈🎧`

### Description block

Start with the sketch hashtag (e.g. `#CirclesNo9`), then paint the visual
experience. Weave **CamelCase hashtags inline** as natural parts of the
sentence, not dumped at the end. Use emojis as punctuation — after phrases,
not every word.

**Examples (description block — density and hashtag weaving, not copy-paste):**
- `#CirclesNo9 Toruses breathe through a hex lattice—each ring a slow spectrum exhale 🌈💫 #Kaleidoscopic #SacredGeometry tension, then release.`
- `#DonutsNo2 ADD stacks the halo until the beat feels like stained glass under voltage 🍩💎 #AudioReactive heat.`

**Hashtag weaving (non-negotiable):** Tags must read as **grammar**, not
stickers. Prefer patterns like **`#TagOne #TagTwo blooms as …`** or
**`…a #Luminous reality. #Futuristic voltage …`** — the hashtag is the noun,
adjective, or subject the sentence is *about*. Avoid a plain scene followed by
a pile of tags (`…energy. #Futuristic #Luminous` with no syntactic link).

**Voice:** Prefer **strong, simple verbs** (blaze, fracture, tear, spiral,
pulse) and one clear image over ornate stacked metaphors (“sugar in the
synapses,” “rewrite gravity”) that sound like the model is **trying to sound
poetic**. Evocative ≠ fancy.

**Hashtag style:**
- **Maximum 5 hashtags per caption.** Choose the 5 that best balance discoverability with the sketch's identity. Prioritize: the sketch name (e.g. `#CirclesNo9`), the core art form (e.g. `#GenerativeArt`), and 3 others that capture what makes this piece unique — could be a visual quality (`#SacredGeometry`, `#Kaleidoscopic`), the music genre (`#HipHop`), or the technique (`#AudioReactive`). The tech footer tags (e.g. `#ReasonStudios`, `#p5js`) no longer get `#` — write them as plain text to stay within the 5-hashtag limit.
- Always CamelCase: `#SacredGeometry`, `#CosmicArt`, `#PsychedelicArt`
- Inline, as part of the sentence flow
- Descriptive adjectives that double as discoverable tags are good candidates — `#Kaleidoscopic`, `#Ethereal`, `#Luminous`, etc. — but only if they earn one of the 5 slots.

### Quote

Include a relevant quote from an artist, scientist, musician, or
philosopher. Format:

```
"Quote text." — Author Name [emoji(s)]
```

Or with an @ handle if the author is on the platform:

```
"Quote text" – @handle - Full Name
```

The quote should resonate with the theme — not be generic motivation.
Think Tesla on vibration, Kandinsky on color, Einstein on mystery.

Always offer 2–3 quote options so the user can pick or ask for more.
Present them in the same message as the full caption **after** the interview
step (not before the user has answered).

### Closing line (sign-off — not the tech line)

This is the **last poetic beat** before credits: voice of the artist, image +
sound tied together, wonder or punch. Weave in `#AudioReactive` and
`#GenerativeArt` (or `#GenerativeDesign`) naturally here.

**Do not** skip this or replace it with tooling. **Do not** treat the tech
footer as the emotional sign-off — the tech line is bookkeeping; the closing
line is the goodbye.

**Examples (tone only — adapt to the piece):**
- `#AudioReactive — code becomes mandala ✨ #GenerativeArt` (punchy, one
  metaphor, hashtags woven)
- `The glow doesn't argue with the groove—it inherits it. #AudioReactive #GenerativeArt 🌌`
- `What you hear redraws what you see—same signal, two languages. #GenerativeArt 🎧`

### Tech footer (credits — always last line)

Always end the caption with **one** credits line, **after** the closing line.
Since the tech tools don't burn hashtag slots, write them as plain text.

**Canonical shape (use this exact line unless the artist explicitly requests a
different credits string):**

```
Music made in ReasonStudios 🎹 Animation created with p5js, WebGL and ToneJS 💻
```

- **Never** drop `Music made in ReasonStudios 🎹` or the phrase
  `Animation created with` — that pairing is the signature footer.
- **Do not** substitute “more accurate” stack fragments (e.g. “Web Audio FFT,
  MIDI”) for this public line **unless the artist explicitly asks** — the
  footer is **house style**, not a build manifest.
- This line is **not** a substitute for the closing line above.

## Platform-specific rules

Instagram and Threads are linked — the same caption is posted to both.
The caption must therefore satisfy **both** platforms' constraints
simultaneously. In practice this means writing to the Threads 500-character
limit, since that's the tighter constraint (Instagram allows 2,200).

- **First 125 characters** are the Instagram preview before "...more" — make the opening hook count even within the short format.
- **500-character hard limit** (Threads). Everything — text, hashtags, emojis, spaces, newlines — counts.

### Character count verification (mandatory)

Use **Cursor’s embedded browser** (MCP `cursor-ide-browser`) against
https://wordcounter.net/character-count — **not** the system default browser
unless the user explicitly opts out. **Do not** verify (or “double-check”)
using PowerShell, Python, `wc`, the editor’s line/char indicator, or any other
local counting — the wordcounter.net result with **Count Spaces** on is the
source of truth.

**So the panel is visible without extra steps for the artist:** call
`browser_navigate` with `position: "side"` and `newTab: true`, then complete
verification in that tab.

Workflow:

1. Navigate to the URL above (side + new tab as above).
2. Confirm **Count Spaces** is checked (use the page snapshot; toggle via the
   checkbox if it is off).
3. Paste the full caption into the main text area (`browser_fill`), read the
   **Characters** figure from the page (snapshot and/or screenshot if the count
   is not in the accessibility tree).
4. If the count exceeds 500, trim the caption and repeat from step 3 until
   ≤500.

Report the final number as `Character count: [N]/500` in the output.

## Style notes

- **Emojis:** Use generously but intentionally — as visual punctuation, not filler. 2–4 per section is typical. Match them to the content (🌌 for cosmic, 🎧 for audio, 💎 for polished visuals, 🔮 for mystical).
- **Tone:** Poetic and evocative with an undercurrent of technical wonder. The captions speak to both art lovers and creative coders. Avoid being purely technical or purely flowery — blend both.
- **Hashtags as language:** Hashtags aren't metadata dumped at the end. They're woven into sentences as emphasized words. `#SacredGeometry` reads as a concept, not a tag.
- **No generic AI voice:** Avoid corporate social media language ("Check out my latest!", "Don't miss this!", "Link in bio!"). The voice is that of an artist sharing their work, not a brand manager.
- **Match the bar set by the hook examples:** If the opening line sings and the
  description reads like patch notes, rewrite the middle until the whole post
  feels like one voice — lush, specific, rhythmic.
- **Execute to the bar:** The examples in this skill are already strong; if the
  output feels weaker, **rewrite** — don’t treat gaps as “missing instructions.”

## Full caption calibration (quality bar)

Use these as **length, rhythm, and hashtag-weaving references** (not templates
to plagiarize). Note **closing line** vs **tech footer** are distinct.

**Circles (chill / sacred / hip-hop mood — inline tags + punch closing):**

```
🌀 Geometry breathes. Rhythm dissolves. 🧘

#CirclesNo9 — luminous toruses spiral across a hexagonal lattice, each ring spinning through the full spectrum 🌈💫 #Kaleidoscopic #SacredGeometry blooms as chill hip hop pulses beneath ethereal choirs 🎧✨

"Sitting quietly, doing nothing, spring comes, and the grass grows by itself." — Matsuo Bashō 🪷

#AudioReactive — code becomes mandala ✨ #GenerativeArt

Music made in ReasonStudios 🎹 Animation created with p5js, WebGL and ToneJS 💻
```

**Rectangles (high-energy / futuristic — tags inside noun phrases, not bolted on):**

```
⚡🔊 Pumping bass rewires the frame.

#RectanglesNo1 — four corner halos blaze and fracture, light tearing through the frame of a #Luminous reality. #Futuristic voltage tickles the edges of the universe. 🌐💫 🎧⚡

"Everything in the universe has a rhythm, everything dances." — Maya Angelou ✨

#AudioReactive — four frames, one voltage ✨ #GenerativeArt

Music made in ReasonStudios 🎹 Animation created with p5js, WebGL and ToneJS 💻
```

## Output format

**After the interview is answered (or waived):** present quote options and a
single caption (same text for Instagram and Threads):

```
## Quote options

1. "Quote A" — Author
2. "Quote B" — Author
3. "Quote C" — Author

## Caption (using quote [N])

[caption text]

Character count: [N]/500
```

Always verify the character count using the **Character count verification**
workflow above (embedded browser, wordcounter.net, Count Spaces on). If it
exceeds 500, trim and re-verify in the same way — still **no** terminal or
PowerShell counting.
