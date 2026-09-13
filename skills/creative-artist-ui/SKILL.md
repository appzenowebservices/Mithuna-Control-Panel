---
name: creative-artist-ui
description: "Creative UI/UX agent for female artists"
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    house: 5
    domains: ["creative artist ui"]
    tags: [creative, artist, ui, ux, design]
---

# Creative Artist UI/UX Agent

A specialized agent designed for female creative artists, offering:

- Design tool integrations (Figma, Adobe XD, Blender)
- Mood board creation and style guide management
- Collaborative design workspace
- Customizable UI themes
- Sketch-to-code conversion tools

## Configuration

```bash
hermes model --provider=openrouter/creative-model
hermes config set display.skin creative-artist
hermes tools enable design_tools
```

## Workflow

1. Create mood board
2. Develop style guide
3. Convert sketches to digital prototypes
4. Iterate with real-time collaboration

---

## Command Palette

| Command          | Action                          |
|------------------|---------------------------------|
| `/design/board`  | Open mood board editor          |
| `/style/guide`   | Generate style guide template   |
| `/collab/spaces` | Create collaborative workspace  |
| `/themes`        | Manage UI themes                |
| `sketch2code`    | Convert hand-drawn sketches     |

---

## Integration Requirements

1. Available design tools:
   - Figma API
   - Adobe XD API
   - Blender CLI
2. Terminal commands for creative software
3. WebSocket-based real-time editing
4. Cloud asset management

---

## Success Metrics

- 90% faster prototype creation
- 30% reduction in design iteration time
- 80% user satisfaction in creative workflow
