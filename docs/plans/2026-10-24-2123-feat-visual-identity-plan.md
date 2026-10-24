---
title: Simmery Visual Identity - Plan
type: feat
date: 2026-10-24
topic: visual-identity
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Simmery Visual Identity - Plan

## Goal Capsule

- **Objective:** Every Simmery screen, at the desk, in the store and at the stove, carries one recognisable look, so UI work can start without deciding style again.
- **Product authority:** This Product Contract governs the visual identity only. Product behaviour stays with `docs/plans/2026-10-24-1024-feat-simmery-foundation-plan.md`.
- **Open blockers:** None. Exact component details are settled while building (see Key Decisions).

---

## Product Contract

### Summary

Simmery adopts the "Dawn Outrun" identity: light synthwave recast at sunrise.
A striped sun rising out of a slow haze-blue-to-apricot sky is the one signature element. It appears in only a few places, and every other surface is flat paper, indigo ink and a single dusk-blue accent.
The reference page `docs/design/dawn-outrun.html` shows the identity applied to four phone screens, the desktop "Plan Week 44" screen and a small UI kit.

### Key Decisions

- **Dawn Outrun is the identity** (session-settled: user-directed — chosen over Pickle Press, Enamel Rim, Frosted Polymer and Graduated after three rounds of side-by-side comparison: it grew out of the owner's own "light theme, retro synthwave" cue). Governs R1–R12.
- **One signature element, used sparingly** (session-settled: user-directed — chosen over richer round-2 versions with grids, glows, chrome and gradients on many elements: feedback was "a bit much going on"). Governs R1, R2, R3.
- **Light theme is the identity.** The owner's cue named a light theme, and every round was explored light-only. A dark theme is deferred (see Scope Boundaries).
- **Details are settled while building** (session-settled: user-directed — chosen over continuing to refine mockups: "details we can sort out when we are actually building"). The requirements below fix the signature, palette roles and type. Spacing, radii, iconography and component specifics follow the reference page loosely and may change during implementation. Governs R12.

### Requirements

**Signature and restraint**

- R1. The signature is a striped sun rising out of a slow sky gradient (haze blue → lavender → apricot). It appears only in the brand mark and app icon, the recipe-detail hero, and the cooking timer.
- R2. All other surfaces are flat: paper ground, white cards, indigo ink and hairline dividers. Dusk blue is the single accent, used for primary actions, links, the active tab and the current-step marker.
- R3. Simmery uses no pink or magenta, glows, chrome text, perspective grids, scanlines, or gradients on list rows, number tiles or progress indicators.

**Colour and state**

- R4. The palette is:

  | Role | Value |
  |---|---|
  | Ground (apricot paper) | `#FFF7EF` |
  | Surface (cards) | `#FFFFFF` |
  | Ink | `#262848` |
  | Ink soft (secondary text) | `#585C7E` |
  | Hairline | `#E9E2DC` |
  | Accent (dusk blue) | `#3D4FA8` |
  | Sky gradient | `#DDE6F3` › `#ECE3F1` › `#FFE6D3` |
  | Sun gradient | `#FFD98A` › `#FFB585` › `#EFA48E` |
  | Checked (lagoon) | `#0B7A78` on `#DDF4F1` |
  | Offline / pending sync (amber) | `#8A4B00` on `#FFE7B8` |

- R5. Each semantic state keeps its own colour and nothing else uses it: lagoon means checked or done, and amber means offline or waiting to sync. Amber must stay distinguishable from the warm sun tones.

**Typography and wordmark**

- R6. Display type is Oxanium (headings, the timer readout, the wordmark), body type is Barlow, and utility type for amounts and labels is Share Tech Mono.
- R7. The wordmark is flat ink Oxanium next to a small striped sun on a horizon line, with no chrome, skew or drop shadow.

**Contexts of use**

- R8. Cooking-step text is at least 29px bold in ink, so it can be read from about 1 m at the stove.
- R9. All body and secondary text meets at least 4.5:1 contrast against its background. The palette in R4 already does: ink on ground is 13.4:1, ink soft on ground 6.1:1, white on dusk blue 7.3:1, and offline text on amber 5.6:1.
- R10. On the shopping list, offline state is a flat amber banner, and each check-off still waiting to sync carries a small amber marker, so both can be read at a glance in the aisle.
- R11. The identity applies equally to the mobile PWA and to desktop layouts. The desktop "Plan Week 44" screen on the reference page is the desktop example.

**Reference**

- R12. `docs/design/dawn-outrun.html` is the visual reference for building. Implementation may deviate in detail, but not from R1–R11.

### Scope Boundaries

**Deferred for later**

- A dark theme. It needs its own pass to translate the dawn sky.
- An icon set beyond the simple line icons on the reference page.
- Motion and animation (for example, a sunrise on load or a moving timer).
- Photo and illustration treatment for recipes. The reference page uses the sun hero as the placeholder.
- A final spacing and radius scale. The reference values are a starting point.

### Dependencies / Assumptions

- Oxanium, Barlow and Share Tech Mono are open-licence Google Fonts. The shopping list must work offline (foundation plan R15), so the fonts have to be available offline too.

### Outstanding Questions

**Deferred to Planning**

- How the tokens in R4 and R6 reach the web app (CSS custom properties, a theme module, or a utility framework config). The foundation plan mandates no component framework.
- Whether fonts are self-hosted with the app or loaded from Google Fonts and cached by the service worker, given the offline requirement.
- Whether pill-shaped buttons from the reference page stay, or controls move to a smaller radius during build.

### Sources / Research

- `docs/design/dawn-outrun.html`: round-3 reference page with tokens in its `:root` block, the four phone screens, the desktop screen and the UI kit.
- `docs/plans/2026-10-24-1024-feat-simmery-foundation-plan.md`: product contract the UI work builds on (offline shopping is R15). The enriched version on PR #1 (commit `3db05e8`) adds the web-app stack (KTD9) and offline mechanism (KTD8).
- Exploration history (private artifact with all three rounds and every rejected direction): https://claude.ai/artifact/Lt6CEsvhqtiJgYYSUWCrcK
