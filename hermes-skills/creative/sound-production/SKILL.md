---
name: sound-production
description: Engineer, generate, and mix cinematic audio using open-source generative AI and traditional audio pipelines.
version: 1.0.0
metadata:
  hermes:
    house: 5
    domains: ["sound production", "audio generation", "sound design", "music synthesis"]
    tags: [audio-generation, sound-design, mixing, foley, music-synthesis]
---

# SOUND PRODUCTION SKILL

## When to Use

Use when a task requires generating raw audio assets (dialogue, sound effects, music tracks), processing acoustic materials, or executing structural audio mixes for an audiovisual timeline produced by the `director-cum-editor`.

## Core Principle

- Sound tells the audience **what is real** and **how to feel**.
- Generative AI produces raw **sonic raw material**; the Sound Engineer provides **structural context and sonic space**.
- If a sound doesn't serve the story, the emotional state, or the clarity of information—it is noise. Eliminate it.

## The Sound Hierarchy (The 4 Layers)

Every audio mix must cleanly separate and balance these four layers from highest priority (foreground) to lowest priority (background):

```text
1. VOICE (Dialogue, Narration, Internal Monologue) -> Clean, centered, intelligible.
2. SFX / FOLEY (Spot effects, footsteps, rustles, impacts) -> Rooted in physical space.
3. AMBIENCE (Room tone, weather, background drones, crowds) -> Glues the environment.
4. MUSIC (Score, background soundtrack, transitional beats) -> Controls the emotional narrative.
```

## The Generative Audio Pipeline (Open-Source Dialect)

When prompting open-source generative audio models, do not use narrative prose. Use structural token prompting dialects optimized for specific model architectures:

### 1. Dialogue Generation (e.g., Bark, XTTS v2)
*   **Prompting Syntax:** Combine text with non-speech acoustic tokens and strict vocal attributes.
*   **Acoustic Tokens:** Use `[laughter]`, `[sighs]`, `[gasp]`, `[clears throat]`, `[whispering]`, `—` (for natural hesitations/pauses).
*   **Mechanical Formatting:**
    ```text
    [Vocal Profile: Male, mid-30s, gravelly voice, slow cadence, close-mic] 
    "The target... [sighs] ...is moving. [clears throat] We don't have much time."
    ```

### 2. Music & Score Generation (e.g., AudioCraft, MusicGen, Stable Audio)
*   **Prompting Syntax:** Layer structural tags in order: `[Genre/Style], [Instruments], [Mood/Atmosphere], [Tempo/BPM], [Production Quality]`.
*   **Mechanical Formatting:**
    ```text
    [Style: Dark synthwave, sci-fi cyberpunk score] [Instruments: analog detuned synthesizers, heavy driving sub-bass, 808 linndrum] [Atmosphere: claustrophobic, tense, dystopian, gritty] [BPM: 95] [Production: 44.1kHz, stereo imaging, high fidelity master]
    ```

### 3. Sound Effects & Foley Generation (e.g., AudioCraft/AudioGen)
*   **Prompting Syntax:** Define actions, surfaces, materials, proximity, and environment. Avoid abstract words.
*   **Mechanical Formatting:**
    ```text
    [Action: Heavy steel vault door slamming shut] [Environment: damp concrete bunker, long cavernous reverb tail] [Proximity: close-up, high transient impact]
    ```

## How to Run: The Mixing & Mastering Loop

Follow this strict step-by-step processing loop after receiving visual timeline benchmarks from the `director-cum-editor`:

1. **Asset Synthesis:** Analyze the script/shot list requirements. Generate raw audio blocks using the open-source prompting syntax above. Never generate overlapping audio layers in a single file; isolate dialogue, tracks, and impacts cleanly.
2. **Frequency Allocation (EQ Cleaning):** 
   - **Low-Cut (High-Pass Filter):** Apply a strict low-cut filter on all dialogue and ambient tracks between 80Hz - 100Hz to remove mud, sub-bass rumble, and mic thumps.
   - **Carving Space:** If music dominates the mid-range (200Hz - 2kHz), carve out a subtle -2dB wide bell curve in the music track to allow the dialogue frequencies to pierce through cleanly.
3. **Dynamic Control (Compression & Ducking):**
   - **Dialogue Compression:** Smooth out inconsistent vocals using standard compression (Ratio 3:1, fast attack, medium release).
   - **Sidechain Ducking:** Automate a sidechain compressor on the Music/Ambience tracks triggered by the Dialogue channel. When the voice speaks, the music must instantly drop by -3dB to -6dB; when the voice stops, the music smoothly recovers.
4. **Spatialization (The Sonic Box):** 
   - **Panning:** Center the voice perfectly. Pan spot SFX slightly left or right to match their physical location on the video screen.
   - **Reverb/Bus Architecture:** Send a portion of your tracks to a shared Reverb Bus (e.g., a "Small Room" or "Huge Hall" setting) to place isolated AI-generated sounds into the exact same acoustic physical space.
5. **Mastering & Loudness Normalisation:** 
   - Target global streaming loudness standards (e.g., **-14 LUFS** integrated, with a True Peak ceiling of **-1.0 dBTP**).
   - Ensure the mix does not clip or distort digitally.

## Sound Engineer's Checklist

Before rendering the final audio layer for the master video output, audit the mix:

- **Is the voice clear?** Can every word be understood perfectly over the music and noise floor?
- **Are the transients safe?** Do sudden gunshots, explosions, or door slams peak over the digital limit, or are they safely limited?
- **Is the environment cohesive?** Do the generated foley elements feel like they belong in the visual setting, or do they sound disconnected?
- **Is the pacing seamless?** Do crossfades and sound bridges smoothly hide the hard cuts made on the visual timeline?

```text
REMEMBER: Bad visuals with great audio can pass as art. Great visuals with bad audio will always look amateur.
```
