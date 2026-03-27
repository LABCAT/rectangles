---
name: social-media-captions
description: >-
  Generate captivating social media captions for creative coding animations,
  tailored to Instagram and Threads. Use this skill whenever the user wants to
  write a caption, post, or social copy for their animation work, even if they
  just say something like "caption for this", "post this", "write something for
  insta", or mention sharing their work online.
---

# Social Media Captions

Generate captions for Instagram and Threads that showcase creative coding
animations — audio-reactive, generative, MIDI-driven visual art.

## Workflow

### 1. Gather context

Read the sketch code the user points you to (or the currently open file). Extract:

- The sketch name/number (e.g. `#CirclesNo9`)
- Visual elements (shapes, geometry, colors, effects)
- Audio/music relationship (audio-reactive, MIDI-synced, which instruments)
- Technologies used (p5js, WebGL, ToneJS, etc.)
- Any thematic through-line (sacred geometry, cosmos, psychedelia, etc.)

### 2. Interview the user

The code won't tell you everything. Ask about details you can't infer:

- **What does it look like in motion?** Colors shifting, particles flowing, shapes morphing — the code tells you what's possible, but the user knows what's actually happening in the final render.
- **What's the mood/feeling?** Meditative, energetic, dark, euphoric, cosmic?
- **What music genre/vibe?** Hip-hop, ambient, electronic, funk?
- **Any specific theme** they want to emphasize?
- **Is there a quote** they want to include, or should you suggest one?

Keep it conversational — don't dump all questions at once. Ask what feels
missing after reading the code.

### 3. Generate the caption

Follow the structure and style below. Generate both an **Instagram version**
and a **Threads version** (trimmed to fit the 500-character limit).

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
Present them as a short list before (or alongside) the full caption.

### Closing line

A sentence or two that ties the audio-reactive / generative art angle
together. Weave in `#AudioReactive` and `#GenerativeArt` (or
`#GenerativeDesign`) naturally.

### Tech footer

Always end with a credits line. Since the tech tools don't need to burn
hashtag slots, write them as plain text:

```
Music made in ReasonStudios 🎹 Animation created with p5js, WebGL and ToneJS 💻
```

Adjust based on the actual tech stack. The "Music made in ReasonStudios"
part stays consistent (the user makes music in Reason).

## Platform-specific rules

Instagram and Threads are linked — the same caption is posted to both.
The caption must therefore satisfy **both** platforms' constraints
simultaneously. In practice this means writing to the Threads 500-character
limit, since that's the tighter constraint (Instagram allows 2,200).

- **First 125 characters** are the Instagram preview before "...more" — make the opening hook count even within the short format.
- **500-character hard limit** (Threads). Everything — text, hashtags, emojis, spaces, newlines — counts.
- Verify the character count using https://wordcounter.net/character-count (with "Count Spaces" checked). Paste the caption there and confirm it shows ≤500 characters. Navigate to this URL in the browser, paste the caption text, and read back the character count shown on the page.

## Style notes

- **Emojis:** Use generously but intentionally — as visual punctuation, not filler. 2–4 per section is typical. Match them to the content (🌌 for cosmic, 🎧 for audio, 💎 for polished visuals, 🔮 for mystical).
- **Tone:** Poetic and evocative with an undercurrent of technical wonder. The captions speak to both art lovers and creative coders. Avoid being purely technical or purely flowery — blend both.
- **Hashtags as language:** Hashtags aren't metadata dumped at the end. They're woven into sentences as emphasized words. `#SacredGeometry` reads as a concept, not a tag.
- **No generic AI voice:** Avoid corporate social media language ("Check out my latest!", "Don't miss this!", "Link in bio!"). The voice is that of an artist sharing their work, not a brand manager.

## Output format

Present a single caption (since it goes to both Instagram and Threads)
along with quote options:

```
## Quote options

1. "Quote A" — Author
2. "Quote B" — Author
3. "Quote C" — Author

## Caption (using quote [N])

[caption text]

Character count: [N]/500
```

Always verify the character count by pasting the caption into
https://wordcounter.net/character-count (with "Count Spaces" checked).
If it exceeds 500, trim and re-verify.
