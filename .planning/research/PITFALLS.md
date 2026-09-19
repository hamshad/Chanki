# Pitfalls Research: Chanki — Chinese 4-Sided Anki PWA

**Domain:** PWA spaced-repetition flashcard app (Chinese) with handwriting quiz, TTS audio, mic pitch-contour trainer, Firebase sync, hidden admin
**Researched:** 2026-09-19
**Confidence:** MEDIUM (Firestore rules + SM-2 + hanzi-writer licensing verified against official/authoritative sources; iOS PWA quotas, TTS quirks, pitch-detection heuristics from multiple community sources converging — marked where single-source)

## Critical Pitfalls

### Pitfall 1: Easter-egg admin becomes open-write hole in Firestore

**What goes wrong:**
Hidden route / multi-tap / konami trigger plus client-side access-code check feels like security. It is not. Firebase config ships in client bundle; anyone extracts project ID and calls Firestore REST directly, bypassing UI gate entirely. Result: spam decks, wiped collections, storage bill abuse. ~30% of production Firebase apps have overly permissive rules on at least one collection (AuditYourApp via app369, 2026).

**Why it happens:**
"No login by design" pushes teams toward `allow read, write: if true` (test mode left on) or `if request.auth != null` with anonymous auth enabled — which any script satisfies via one `signInAnonymously()` call. Client-side code gate confused with authorization.

**How to avoid:**
- Deny-by-default rules; per-collection match blocks, never broad `match /{document=**}` with allow.
- Deck/card writes require Firebase custom claim (`request.auth.token.admin == true`), set server-side via Admin SDK — never a Firestore `isAdmin` field clients can edit.
- Device docs scoped by ownership: `allow read, write: if request.auth.uid == deviceId` path segment; validate schema types + field lengths in rules (`request.resource.data`).
- Enable Firebase App Check (DeviceCheck / Play Integrity / reCAPTCHA) enforcement on Firestore + Storage, not just monitoring.
- Admin write path: anonymous auth for learners is fine, but admin code exchange must happen in a Cloud Function that mints/sets the custom claim — never verify code client-side.
- Test rules in CI with emulator (`assertFails` for unauthenticated + cross-device reads/writes) and Rules Playground from attacker's seat.

**Warning signs:**
Rules file contains `if true`, `request.time < timestamp.date(...)`, or bare `request.auth != null` without uid comparison; new collection shipped without its own match block; Storage rules not reviewed alongside Firestore rules.

**Phase to address:** Backend/sync phase (first Firestore rules commit — before any production deploy). Re-verify in admin/import-export phase.

---

### Pitfall 2: iOS PWA cache eviction silently kills "offline-first"

**What goes wrong:**
App works offline in testing, then after ~7 days of non-use (or low storage, or Safari history clear) iOS evicts Cache API + IndexedDB contents. User opens app airplane-mode to review — empty deck, lost progress, broken trust. Pre-generated MP3 audio cache makes this worse (see Pitfall 9).

**Why it happens:**
iOS caps PWA storage (~50 MB reported vs hundreds of MB on Chrome), aggressively evicts script-writable storage after inactivity, shares nothing between Safari and installed PWA, and offers no Background Sync to silently re-sync. Developers test fresh-install offline, never the evicted-state path.

**How to avoid:**
- Design for empty-cache as normal state: every launch re-validates cache, re-caches app shell first, treats missing decks/progress as re-sync event from Firestore, never as fatal error.
- Keep precache minimal (app shell HTML/CSS/JS only); runtime-cache decks + audio with explicit size cap and LRU eviction; call `navigator.storage.estimate()` and warn/clean above 80%.
- Request `navigator.storage.persist()` (not guaranteed on iOS — still do it).
- Store review progress in IndexedDB with Firestore as source of truth; on cache-miss, pull from server and show "re-syncing" state.
- In-app "Refresh / re-download for offline" button; force service-worker update check on launch (`reg.update()`), versioned `sw.js` URL.
- Never store large MP3 libraries in Cache API blindly — prefer on-device TTS with MP3 fallback (see Pitfall 5/9).

**Warning signs:**
No handling for `fromCache == true` stale data; QA never tested "install → sync → wait/kill storage → airplane mode"; cache holds full audio library.

**Phase to address:** PWA shell / offline-foundation phase (first phase). Add eviction-recovery test as acceptance criterion.

---

### Pitfall 3: SM-2 ease hell + whole-card grading distorting scheduling

**What goes wrong:**
Two compounding bugs. (a) Classic ease hell: Again (−20pp) / Hard (−15pp) drive ease to the 130% floor; only Easy raises it, so Again+Good-only users accumulate cards stuck at minimum ease reviewed far too often. (b) Chanki-specific: one whole-card grade collapses four sides' recall into a single quality value — a card failed on tone but known on meaning gets the same schedule as total blackout, corrupting per-side memory modeling.

**Why it happens:**
Naive port of SM-2 formula without Anki's guardrails (Anki exempts learning/relearning failures from ease changes, floors ease at 130%, adds fuzz, uses elapsed-days not scheduled interval). Whole-card grade chosen for mobile speed without compensating scheduler design.

**How to avoid:**
- Implement Anki-correct SM-2 from day one: ease floor 1.3; learning-phase failures don't touch ease; Again puts card in relearning (interval reset or new-interval multiplier), not just ease decrement; Good = interval × ease, Hard = interval × 1.2 with −15pp, Easy = interval × ease × bonus with +15pp; add fuzz to intervals so same-grade cards don't bunch.
- For 4-sided distortion: log per-side pass/fail in review history even though grade is whole-card; use worst-side or failed-side-count to modulate grade (e.g., any side failed caps grade at Again/Hard); retry failed sides in-session (already planned) AND record them for scheduler input.
- Consider FSRS-lite later, but ship correct SM-2 first — scheduler rewrite mid-stream invalidates all existing intervals.
- Store `ease, interval, reps, lapses, dueAt, lastGrade, sideHistory[]` per card-state; never recompute from grade alone.

**Warning signs:**
Ease histogram clustering at 130%; users complain same cards appear every day; scheduler stores only `nextDue` without ease/interval; grade computed without side data.

**Phase to address:** Review-flow + SRS phase. Scheduler unit tests (Again/Hard/Good/Easy transitions, floor, relearning) are phase exit gate.

---

### Pitfall 4: hanzi-writer CDN dependency + coverage gaps + license attribution

**What goes wrong:**
(a) Default hanzi-writer usage lazy-loads per-character JSON from CDN — airplane-mode writing practice breaks. (b) Rare/proper-noun characters missing from hanzi-writer-data (derived from Make Me a Hanzi) render as blank with no fallback. (c) Data carries Arphic Public License (not MIT like the library) requiring license inclusion — shipping without `ARPHICPL.TXT`/attribution violates redistribution terms.

**Why it happens:**
Docs demo uses CDN loader; offline requirement discovered late. Coverage assumed universal for CJK. License file noticed only at audit time (library MIT vs data Arphic split is easy to miss).

**How to avoid:**
- Self-host stroke JSON: bundle top-N characters (deck vocabulary + HSK common set) in app package / IndexedDB at sync time; lazy-fetch remainder from own hosting with graceful "stroke data unavailable — free-draw mode" fallback.
- Build coverage check into deck import: flag characters lacking stroke data at import/admin time, not at practice time.
- Ship `ARPHICPL.TXT` + attribution screen crediting Make Me a Hanzi / Arphic; keep data version pinned.
- Quiz strictness: hanzi-writer quiz mode rejects slightly-off strokes — set `leniency` generous for beginners, tighten with difficulty; test on small phone screens where fat-finger strokes misfire.

**Warning signs:**
Network tab shows `cdn.jsdelivr.net/hanzi-writer-data` fetches; no fallback UI for missing glyph; no license file in repo.

**Phase to address:** Handwriting phase (bundle + fallback + license). Deck-import validator covers coverage check.

---

### Pitfall 5: TTS voice inconsistency across browsers (especially iOS)

**What goes wrong:**
`speechSynthesis.getVoices()` returns different zh-CN voices per platform (Tingting/Xiaoxiao on Apple, Google Pinyin voice on Chrome, none until async `voiceschanged`); iOS requires first utterance inside a user gesture or audio stays silent; long-textutterances and certain punctuation (CJK quotes, `< >` brackets) hang or kill synthesis on iOS 17/26 with no error event; rate/pitch behave differently per voice so tone-3 dips sound wrong on some engines. User hears inconsistent model pronunciation — fatal for tone learning.

**Why it happens:**
Web Speech API is OS-service-backed, not standardized audio; voice inventory, gesture policy, and bug surface differ per OS version. Developers test on one desktop browser.

**How to avoid:**
- Architecture: pre-generated MP3 per card in Firebase Storage as primary audio (consistent voice everywhere, cacheable); on-device `speechSynthesis` as fallback/offline path only.
- Harden the fallback: wait for `voiceschanged` + non-empty list before enabling audio; pick voice by `lang == 'zh-CN'` with explicit allowlist + user override in settings; always `speak()` from tap handler (prime with empty utterance on first gesture for iOS); sanitize text (strip `< >`, normalize CJK quotes); chunk long strings; listen `onerror/onend` with timeout watchdog and fall back to MP3.
- Record `audioUrl + ttsVoiceUsed` per card; never assume same voice across sessions — cache voice URI, re-resolve each launch.
- Acceptance test matrix: iOS Safari PWA, Android Chrome PWA, desktop — same card must produce intelligible zh audio on all three.

**Warning signs:**
`getVoices()[0]` hardcoded; no `voiceschanged` handling; audio initiated from timers/async callbacks; no MP3 fallback.

**Phase to address:** TTS/audio phase, after offline foundation (needs cache-quota plan from Pitfall 2/9).

---

### Pitfall 6: Pitch detection octave errors + noise = useless tone feedback

**What goes wrong:**
Autocorrelation/YIN locks onto a harmonic (tone reads an octave high/low) or room noise produces confident-but-wrong pitch; tone-3 dip-rise vs tone-2 rise confused; latency >100 ms makes graph feel disconnected; graph compares absolute Hz instead of normalized contour so different voices/genders can't match target shape.

**Why it happens:**
Raw FFT peak-picking or unclamped autocorrelation; no voicing/silence gate (RMS threshold); no range constraint; comparing Hz instead of semitone-normalized contour; detection on main thread janking canvas.

**How to avoid:**
- Use YIN (or autocorrelation with parabolic interpolation) in an AudioWorklet (off main thread); constrain search to speech F0 band (~65–500 Hz, tighter per coarse voice setting); RMS silence gate returns null instead of guessing; exponential smoothing in log-frequency space.
- Compare contours, not absolute pitch: normalize both target and user pitch to semitones relative to utterance mean, then shape-match (DTW or resampled correlation) — this makes male/female/child voices comparable to one reference curve.
- Tone-3 handling: model full dip-rise but accept partial dip (many speakers produce low-falling variant); neutral tone (tone 5): short + light, score duration/energy more than contour.
- Require mic permission UX: explain why before `getUserMedia()` prompt (iOS re-prompts per session in PWA); HTTPS/localhost only; never upload raw audio (on-device only, per privacy constraint); show "too noisy" state instead of fake score.
- Calibrate: per-user pitch-range calibration on first use; "test mic" screen before first tone lesson.

**Warning signs:**
FFT-bin peak picker; no octave clamp; scores absolute Hz distance; detection loop on main thread with canvas draw in same callback; no silence/noise state.

**Phase to address:** Tone-trainer phase (needs deeper research spike: validate YIN-in-Worklet + contour-match approach on target phones before committing UI).

---

### Pitfall 7: Real-time canvas graph jank + DPR memory blowup

**What goes wrong:**
Pitch contour drawn every rAF at native DPR on a 3x phone = 9–16x pixel fill per frame; path re-stroked from full history each frame; GC churn from per-frame allocations; canvas backing store (w×h×4 bytes, quadratic in DPR) eats tens of MB; combined with audio-thread pressure the graph drops to 20 fps and pitch latency spikes.

**Why it happens:**
`canvas.width = cssWidth * devicePixelRatio` copy-pasted without cap; full redraw instead of incremental; no frame throttle; allocations inside hot loop.

**How to avoid:**
- Cap effective DPR at ≤2 (1.25 on low-end via `hardwareConcurrency`/`deviceMemory` heuristic); `alpha: false, desynchronized: true` context hints.
- Throttle draws (30 fps sufficient for contour), incremental draw: shift cached bitmap / pre-rendered static grid offscreen, only stroke newest segment per frame; preallocate ring buffers, zero allocation in loop.
- Dispose explicitly: zero canvas dimensions on unmount; `close()` any ImageBitmaps.
- Decouple: pitch detection in Worklet posts at ~15–30 Hz; canvas consumes latest — never compute detection inside draw callback.

**Warning signs:**
Uncapped DPR multiply; full-history `beginPath` over hundreds of points every frame; `new` allocations in rAF; no fps monitor.

**Phase to address:** Tone-trainer phase (same phase as Pitfall 6); add fps + latency budget to acceptance criteria (~60fps target, <100 ms pitch latency per PROJECT.md).

---

### Pitfall 8: JSON deck schema drift breaks import/export + sync

**What goes wrong:**
`schemaVersion` added but no migrator — v2 decks fail to import on v1 clients (or vice versa); admin edits add fields Firestore rules reject; card `{tone}` encoded inconsistently (1–5 vs 0–4 vs "neutral" string) so tone side + TTS + pitch target disagree; audioUrl present but file missing in Storage.

**Why it happens:**
Schema lives as comment in PROJECT.md, not as validated contract; import parser written permissively ("just JSON.parse"); export and Firestore write paths diverge.

**How to avoid:**
- Single Zod (or equivalent) schema module shared by importer, exporter, admin form, and Firestore rules validation; `schemaVersion` integer, migrator functions v1→v2→…; unknown-version import rejected with clear message.
- Canonical tone enum: `1|2|3|4|5` (5 = neutral/light) everywhere; pinyin with tone marks derived, never hand-entered inconsistently.
- Import pipeline: validate → report per-row errors (don't silently drop) → coverage check (Pitfall 4) → audio existence check (Pitfall 5) → commit.
- Export includes `schemaVersion + exportedAt + appVersion`; round-trip test (export→import→diff) in CI.

**Warning signs:**
Two places constructing card objects; `as any` casts on import; tone represented two ways; no migrator file.

**Phase to address:** Admin/import-export phase; schema module should be created earlier (review/SRS phase) so later phases reuse it.

---

### Pitfall 9: Audio caching strategy blows the 50 MB iOS budget

**What goes wrong:**
Pre-generated MP3 for every card × full deck = hundreds of MB; service-worker cache evicts app shell to fit audio, or iOS evicts everything; review stalls on `<2s network` fetches that should have been cached; users on cellular burn data re-downloading evicted audio.

**Why it happens:**
"Cache everything for offline" without budget math: ~2–5 KB per MP3 snippet × 1000 cards ≈ 2–5 MB (fine) but full-sentence audio or high-bitrate files × large decks exceed quota fast; no prioritization between shell/decks/audio.

**How to avoid:**
- Budget explicitly: shell (<2 MB) > current-deck cards/progress > current-deck audio (low-bitrate mono, ~24–32 kbps spoken word is fine) > rest on-demand.
- Prefer on-device TTS for rare cards; pre-generated MP3 only for deck's core vocabulary; LRU audio cache with `storage.estimate()` guard.
- Stream from Storage CDN with range requests; don't block review flip on audio (text-first render, audio progressive; <100 ms flip budget per PROJECT.md).
- Measure: CI check on total precache size; device test on 50 MB-constrained iOS PWA.

**Warning signs:**
Single cache bucket for everything; no size accounting; high-bitrate stereo MP3s for single syllables.

**Phase to address:** Offline foundation + TTS/audio phase jointly.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `allow read, write: if true` "until launch" | Unblocks dev | Breach + bill; forgotten in prod | Never — use emulator + locked rules from day one |
| Client-side admin code check only | Fast easter-egg | Trivially bypassed writes | Never for writes; OK as UI-hiding only |
| Whole-card grade with no side logging | Simple review UX | Scheduler can't distinguish tone-fail vs blackout; bad intervals forever | Only if side results logged from v1 (planned retry-in-session covers this — keep the log) |
| CDN hanzi-writer-data loader | Zero bundling work | Offline writing broken; first-use latency | Never for core decks; OK for rare-char fallback with cache |
| `speechSynthesis` as only audio | No backend work | Inconsistent model audio; iOS silent failures | Prototype only; ship MP3 primary |
| FFT peak-picker for pitch | 20 lines of code | Octave errors, noise confidence | Never for tone scoring; OK for rough "mic works" indicator |
| Single cache bucket, cache-all MP3s | Simple SW | iOS eviction death spiral | Never |
| Schema as TS comment, no validator | Fast card model | Import/sync breakage across versions | Never — Zod schema is cheap |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firestore offline (web) | Assume persistence on by default (it is off on web; on for mobile) | Explicitly enable + handle `fromCache` metadata; test airplane-mode reads/writes + late-sync last-write-wins conflicts |
| Firestore sync conflicts | Two devices edit same progress doc → silent last-write-wins loss | Per-device progress docs (`devices/{deviceId}`), server-timestamp merge; card content is admin-only so no learner write conflicts |
| Firebase Storage audio | World-readable bucket + predictable URLs scraped; hotlink cost | Per-deck path rules, cache-control headers, referrer/App Check; validate `audioUrl` host allowlist on import |
| App Check | Left in monitor mode forever | Enforce after test-device rollout; include debug tokens for dev |
| `getUserMedia` in iOS PWA | Call on page load → silent deny; `permissions.query` trusted | Request from explicit user tap with rationale screen; HTTPS only; handle `NotAllowedError` with settings guidance |
| AudioContext on iOS | Create/resume outside gesture → suspended, no TTS/pitch | Create on first tap, `resume()` in gesture handler; handle `interrupted` state |
| hanzi-writer-data | Fetch per-char from jsdelivr at quiz time | Self-host + IndexedDB prefetch per deck; fallback free-draw |
| Speech voices | Cache voice object across sessions | Re-resolve by URI each launch; user-overridable setting |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Uncapped DPR canvas | Tone graph jank, memory climb on 3x phones | Cap DPR ≤2; throttle to 30 fps; incremental draw | Any flagship phone, immediately |
| Detection + draw on main thread | UI freezes during mic capture | AudioWorklet detection; canvas consumes at 15–30 Hz | Low-end Android immediately; all phones under noise |
| Full-deck Firestore listener | Slow sync, read-bill spike, stale `fromCache` flashes | Paginate/query by deck + `dueAt`; local query for due cards | >few hundred cards or metered connections |
| Offline query over whole cache | Airplane-mode review list stalls | Local index (IndexedDB) for due queue; avoid collection-scan queries | Long offline periods, large decks |
| Unbounded review history | IndexedDB/Firestore doc bloat | Cap history (e.g., last 200 reps) + aggregate stats; subcollection or separate docs | Months of daily use |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Open Firestore rules (test mode / `if true`) | Full read/write by anyone with project ID | Deny-by-default + per-collection ownership + CI rule tests |
| `if request.auth != null` with anon auth | Any script self-registers → full access | Compare `request.auth.uid` to owned path/field; custom claim for admin |
| Admin code verified client-side | Code extracted from bundle; writes forged | Cloud Function verifies code → sets custom claim; rules check claim |
| Easter-egg route as only gate | Curious users / crawlers find `/admin` | Route hidden AND rules locked AND App Check; treat discovery as expected, writes as denied |
| Storage bucket world-writable | Free malware hosting on your bill | Owner-scoped write paths; admin-only deck audio writes |
| No PII policy enforcement | Mic audio or identifiers uploaded accidentally | Mic processed on-device only; anon UUID, no phone numbers; rules reject PII-shaped fields if applicable |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Grading 4 sides with one tap but no side feedback | Learner doesn't know which side failed | Show per-side pass/fail recap on flip; retry failed sides in-session (planned) |
| Tone graph scores absolute pitch | Women/children always "wrong" vs male reference | Normalized contour matching + calibration; show shape overlap, not Hz gap |
| Mic permission wall with no context | Deny → tone trainer permanently dead on iOS | Rationale screen → system prompt → graceful "how to re-enable" guide |
| Silent TTS failure on iOS | Tap tone side, hear nothing, assume app broken | Tap-to-play from gesture; loading/error states; MP3 fallback; voice setting |
| Stroke quiz too strict on phones | Correct-order strokes rejected; frustration | Leniency setting; generous by default; stroke-hint toggle |
| Cache-eviction data loss surprise | Progress "disappears" after a week away | "Re-syncing your decks…" state; never show empty as error; background re-cache on launch |

## "Looks Done But Isn't" Checklist

- [ ] **Offline review:** Often missing eviction-recovery path — verify airplane-mode after clearing site storage, not just fresh install
- [ ] **SRS grades:** Often missing ease floor + relearning + fuzz — verify Again/Hard/Good/Easy unit tests and ease histogram
- [ ] **Whole-card grade:** Often missing side-result log — verify scheduler receives per-side data
- [ ] **Admin gate:** Often missing server-side enforcement — verify writes rejected via REST with no token / non-admin token
- [ ] **Handwriting:** Often missing offline bundle + missing-glyph fallback + Arphic license file — verify all three
- [ ] **TTS:** Often missing iOS gesture priming + voiceschanged + MP3 fallback — verify on real iPhone PWA
- [ ] **Tone trainer:** Often missing octave clamp + noise gate + contour normalization — verify with high/low voices + noisy room
- [ ] **Canvas graph:** Often missing DPR cap + fps throttle — verify on 3x-DPR phone with fps meter
- [ ] **Deck import:** Often missing schema validation + tone-enum check + audio-existence check — verify bad-file error report
- [ ] **Audio cache:** Often missing size budget — verify total precache < quota with headroom on iOS
- [ ] **Mic privacy:** Often missing on-device-only guarantee — verify no audio bytes leave device (network tab during tone session)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Open rules shipped | HIGH (breach assessment + rotation) | Lock rules immediately → audit writes → clean spam → rotate exposed keys/service accounts → enable App Check → add CI rule tests |
| Ease-hell scheduler live | MEDIUM (regrade history) | Ship corrected SM-2 + side logging → one-time ease renormalization (lift 130%-floored cards) → monitor histogram |
| Schema drift in wild | MEDIUM | Freeze v1 schema → write migrators → version-gated import errors → backfill bad docs via admin script |
| CDN-dependent writing shipped | LOW | Self-host data → prefetch per deck → add fallback UI; no data migration needed |
| TTS-only audio shipped | LOW–MEDIUM | Generate MP3s for core decks → Storage upload → backfill `audioUrl` → keep TTS as fallback |
| Cache-eviction data loss | MEDIUM (trust) | Add re-sync-on-launch + progress-from-server recovery; users re-sync, history preserved server-side |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Open-write admin rules | Backend/sync (first rules commit) | Emulator tests: anon/rest cross-device write denied; admin claim write allowed |
| iOS cache eviction | PWA shell / offline foundation | Airplane-mode-after-eviction test; storage-estimate guard |
| SM-2 ease bugs + grade distortion | Review flow + SRS | Scheduler unit tests; ease histogram; side-log present |
| Stroke data CDN/coverage/license | Handwriting | Offline quiz with network off; missing-glyph fallback; ARPHICPL.TXT shipped |
| TTS inconsistency | Audio/TTS | 3-platform audio matrix (iOS PWA / Android / desktop) |
| Pitch octave/noise errors | Tone trainer (+ research spike first) | High/low voice + noise-room scoring test; latency <100 ms |
| Canvas perf | Tone trainer | fps meter on 3x-DPR device; DPR cap in code |
| Schema drift | Admin/import-export (schema module from SRS phase) | Round-trip export→import CI test; bad-file error report |
| Audio cache budget | Offline foundation + Audio/TTS | Precache size CI check; iOS quota headroom test |
| Easter-egg discovery abuse | Backend/sync + Admin | Pen-test: direct REST writes without claim rejected |

## Sources

- Firebase official: insecure-rules guide (`firebase.google.com/docs/firestore/security/insecure-rules`), offline persistence (`.../manage-data/enable-offline`) — HIGH
- Anki FAQs: SM-2 scheduling (faqs.ankiweb.net), SuperMemo SM-2 original spec (super-memory.org) — HIGH
- hanzi-writer GitHub (chanind/hanzi-writer README: data source Make Me a Hanzi, Arphic license) — HIGH
- iOS PWA limits: magicbell 2026 guide, firt.dev iOS compatibility table, hashhackers + vinova.sg PWA/iOS quirks (50 MB cap, 7-day eviction, no Background Sync, getUserMedia basic) — MEDIUM (multiple converging)
- Firebase rules abuse pattern: Valtik Studios (anon-auth + `auth != null` finding, 2026-01), UnboundCompute (2026-07), CloudThinker audit guide (2026-07), app369 (2026-03) — MEDIUM (converging)
- TTS iOS bugs: StackOverflow iOS 17 CJK-quote hang (fixed iOS 18), iOS 26 `< >` + CJK hang report, Apple Dev Forums zh-CN/Cantonese voice misrouting, mobile-Safari gesture-priming pattern — MEDIUM (converging reports, version-specific; re-verify on current iOS)
- Pitch detection: DEV PitchTester YIN walkthrough (2026-08, voice-range clamp eliminates octave complaints), erhu-tuner autocorrelation piece (2026-08), SeePitch mobile YIN + 60 fps canvas project, pitch-detector repo (RMS gate, range limits) — MEDIUM (converging practice, no single standard lib)
- Canvas perf: memory-management.com canvas/ImageBitmap guide (2026-07, DPR-squared cost, zero-dims disposal), behan05 DPR-cap + fps-throttle pattern (2026-08), bswen offscreen-caching guide (2026-02) — MEDIUM

---
*Pitfalls research for: Chanki Chinese 4-sided Anki PWA*
*Researched: 2026-09-19*
