# Chanki — Chinese 4-Sided Anki PWA

## What This Is

Chanki is a mobile-responsive PWA for learning Chinese with a 4-sided flashcard model (character / pinyin / meaning / tone+audio) instead of standard 2-sided Anki. It works offline, needs no login for review, and syncs progress to Firebase when installed as PWA via anonymous device identity. An easter-egg hidden admin allows card creation, with versioned JSON import/export for decks.

## Core Value

Retention via 4-prompt recall works offline on a phone — if review with spaced repetition fails offline, nothing else matters.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 4-sided review with random prompt side, whole-card grading, flip-then-grade
- [ ] Spaced repetition (SM-2/FSRS style) with Again/Hard/Good/Easy, 20-card sessions, summary screen
- [ ] Offline-first PWA (cards + progress + audio cached, installable)
- [ ] Firebase backend (Firestore + Storage) with anonymous device-as-user progress sync
- [ ] Hidden admin (easter-egg) for card/deck CRUD with access gate
- [ ] Versioned JSON deck import/export
- [ ] Hanzi handwriting practice with stroke-order detection and correction
- [ ] Chinese TTS audio for card tone side (offline-capable where possible)
- [ ] Tone pronunciation trainer: mic capture with real-time pitch contour graph vs target tone shape (e.g. ni3 dip-rise)

### Out of Scope

- [ ] Real user accounts / login / OAuth — no login by design, device identity only
- [ ] Social features / shared leaderboards — single-learner focus for v1
- [ ] Video lessons / grammar curriculum — flashcards + writing + tones only

## Context

- Greenfield repo at `/Users/moksha/Moksha/Hamshad/chanki`, empty, git freshly init. Firebase project to be created.
- Phase 1 discussion (review flow) already locked: random prompt start, whole-card grade, flip through 4 then grade, failed sides retry in-session, Anki 4-button, 20 cards, summary with count + accuracy + next due.
- Card model draft: `{id, hanzi, pinyin, meaning, tone (1-5/neutral), audioUrl, tags, difficulty, createdAt, updatedAt, schemaVersion}`. Audio either pre-generated MP3 in Storage or on-device TTS.
- Admin idea: secret trigger (multi-tap logo / hidden route / konami-style) + access code gate, not real auth; must still lock Firestore rules against public writes.
- PWA identity idea: anonymous UUID in IndexedDB + `devices/{deviceId}` doc in Firestore storing progress; phone-number storage explicitly NOT wanted without consent — keep anon UUID, no PII.
- New v1 additions from user: (1) stroke-order writing detection, (2) zh TTS, (3) mic tone contour graph in real time.
- Known unknowns: best Hanzi stroke data source (Make Me a Hanzi / hanzi-writer), best pitch detection on mobile (autocorrelation / YIN / ML), TTS offline story on iOS/Android PWA.

## Constraints

- **Tech stack**: Web PWA + Firebase (Firestore, Storage, Hosting) — user mandated Firebase
- **Auth**: No login for learners — anon device ID only; admin gate must not become open write hole
- **Compatibility**: Mobile-first responsive, installable PWA on iOS Safari + Android Chrome; mic + audio playback must work in PWA context
- **Performance**: Review interaction <100ms flip, audio start <500ms cached / <2s network, tone graph ~60fps with <100ms pitch latency
- **Offline**: Full review + writing + cached TTS must work airplane-mode after first sync
- **Privacy**: No phone number / PII stored; mic audio processed on-device, never uploaded without consent

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4 sides: character / pinyin / meaning / tone+audio | Core differentiator vs 2-sided Anki | — Pending |
| Random prompt side per review | Forces true recall, avoids order memory | — Pending |
| Whole-card grade (not per-side) | Keeps session fast on mobile | — Pending |
| Flip-then-grade, retry failed sides in-session | Simple mental model, reinforces weak sides | — Pending |
| Anki 4-button + 20-card sessions + summary | Standard SRS users expect | — Pending |
| Firebase + anon device UUID, no login | Zero friction, PWA progress sync | — Pending |
| Hidden admin via easter-egg + code, rules-locked | Prevent spam writes on public site | — Pending |
| JSON versioned deck format | Portable import/export | — Pending |
| hanzi-writer style stroke-order check | Standard stroke data + quiz mode exists | — Pending |
| On-device pitch tracking for tone graph | Real-time feedback needs low latency, privacy | — Pending |
| Depth=comprehensive, YOLO+parallel, research+checks on | User chose thorough planning with quality gates | — Pending |

---
*Last updated: 2026-09-19 after initialization*
