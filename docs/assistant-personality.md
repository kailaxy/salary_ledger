# Assistant personalities (deterministic, offline)

Open Settings → Assistant Personality after downloading your ledger. Pick Supportive Bestie, Financial Gremlin or Sarcastic Accountant, then adjust Chaos from 0–100 in steps of 5. Changes save automatically on this device for this ledger and apply to new answers. Restore defaults returns that ledger to Supportive Bestie at 30%. Existing answers and financial records do not change.

The live preview uses a fictional Food plan of ₱1,000.00, spending of ₱750.00 and remaining plan of ₱250.00. It is explicitly labeled “Fictional example · not your ledger,” regardless of your own currency or data. No network request, model or financial query is needed to change the preview.

| Chaos | Expression |
| --- | --- |
| 0–20 | Mostly professional and concise, minimal humor |
| 25–40 | Friendly and conversational |
| 45–60 | Playful and witty |
| 65–80 | Dramatic and expressive |
| 85–100 | Maximum playful theatrics; financial facts stay literal |

The range has a visible percentage, a descriptive band and an accessible value description. Controls keep keyboard focus as the preview updates; the preset select and slider use native keyboard behavior. Settings still opens on Close rather than an input. Existing focus trapping, visible focus indicators, minimum 44px controls and reduced-motion behavior remain in place. The compact Home composer and approved header spacing are unchanged.

## Facts and personality are separate

The pipeline is:

`Question → LedgerQuery.interpret → LedgerQuery.query → LedgerQuery.format → AssistantPersonality.decorate → UI`

LedgerQuery and its arithmetic are unchanged. `decorate(canonical, verifiedResult, config, variation)` returns the original canonical object plus an intro and context. It never edits the object or reformats amounts. Home inserts the intro separately through textContent before rendering the same canonical label, value, explanations, list items, percentages and comparisons. Existing source timestamps, pending/conflict notices and freshness warnings remain outside styling. Existing conversation turns retain their original text when preferences change.

Contexts use structured financial facts, not formatted money strings, question keywords, notes or category-name heuristics:

- A verified spending increase gets context without a moral judgment.
- Reaching all selected positive fund targets or fully repaying all selected loans gets encouragement. A mixed set does not trigger a blanket achievement claim.
- Spending within recorded positive category plans can get a playful acknowledgement; it is not a claim about future spending or cash.
- Empty matches and insufficient information are handled explicitly, including absent targets, missing income or an unknown affordability plan.
- Over-budget categories, an affordability shortfall, a recorded negative fund balance, negative recorded net income or overdue installments receive restrained, supportive wording at every chaos level.
- Unsupported questions retain the original interpreter/error message and get a gentle introduction. Chat cannot write records.

No result identifies discretionary versus essential purchases. Therefore the implementation does **not** roast a purchase based on its name or size, including coffee or food. All budget overages are treated conservatively. A future explicit, user-approved classification could support discretionary-purchase humor; none is inferred here. Maximum chaos adds theatrics, not personal insults, debt mockery, financial advice, predictions or claims of affordability beyond the canonical plan check.

Each preset is a data-driven registry entry with descriptions, tone instructions, five expression bands and small context-specific reaction pools. Sensitive/insufficient/unsupported pools override persona and chaos. A per-ledger in-memory turn counter selects deterministic variants, combining lead and context pools for four expressive variants before repeating, with no Math.random or network calls. Calm and sensitive responses intentionally use smaller restrained pools. The first variant resets on cold startup or a real ledger identity change; variation is not a persisted question queue. Empty and calm responses can deliberately remain restrained rather than forcing a joke. Ledger identity changes also clear the previous ledger's in-memory question draft/history to avoid carrying it into the new ledger; ordinary refreshes preserve them.

## Local preferences

Version 1 preferences contain only `{version, personalityId, chaos}` in a separate localStorage key:

`sl2_assistant_personality_v1:` + URL-encoded ledger identity.

The identity comes from the authenticated local snapshot, not the app name, a PIN or a user-entered URL. Before there is a ledger, controls are hidden and no unscoped preference is saved. Switching ledgers loads that ledger's preferences or the defaults. Syncing finances does not touch these keys. Reset writes only the active personality key, leaving other ledgers, IndexedDB snapshots/outbox/audit and authentication untouched. Corrupt, unknown, out-of-range or extra-field preferences fall back to defaults. No backend file, spreadsheet column or sync operation is added.

If device storage rejects a write, the settings apply in memory for that ledger and a visible status says they last for this session only. They cannot survive a process/page restart in that case. Clearing browser/app data removes preferences along with the app's other local data; do not do that with unsynced financial changes. Preferences do not follow a user between devices, hosted origins, Dev and release apps.

## Reusable configuration

`AssistantPersonality.getConfig(ledgerId?)` returns a fresh configuration:

- `version: 1`
- `personalityId`: `supportive-bestie`, `financial-gremlin`, or `sarcastic-accountant`
- `name`, `chaos`, `expressionBand`, `expressionLabel`
- `toneInstructions`: persona plus expression instructions
- `humorBoundaries`: canonical-fact, context and safety constraints
- `preferredResponseLength`: at most two short conversational sentences, 240 characters
- `languagePreference: null` (the app has no saved language preference)
- `mode: 'deterministic'`

`setLedger(id)` sets the default scope. `load/save/reset` accept an explicit ledger ID; `config(preferences)` builds a config without saving. `getPresets()` supplies UI options. `preview(config)` supplies the same fictional canonical example with styled intro. `context(verifiedResult)` and `decorate(...)` are pure with respect to financial data; variation is an explicit nonnegative integer.

A later Qwen adapter can consume the configuration and verified facts, while canonical financial rendering remains authoritative. It must not be given synchronization powers or treat notes as instructions. Model outputs must never replace amounts/caveats with invented ones. This increment contains no Qwen/llama.cpp integration, downloads, inference servers, cloud APIs, background services or AI-generated claims.

## Source, deployment and checks

Edit `web/assistant-personality.js`, then run `python3 tools/embed-personality.py`. The identical module is embedded in Index.html for hosted and packaged offline startup; no separate JS fetch or production dependency is introduced. Extend the registry to add a preset rather than branching the financial formatter.

Install the new Actions Dev APK to update the packaged frontend. For hosted use, replace Index.html and deploy a new version of the existing Apps Script web app. No backend files, native code, signing configuration or synchronization changes are needed.

Automated checks cover preset/band validation, per-ledger persistence/reset, corrupt preferences, storage denial, preview invariance, exact canonical facts across all presets at chaos 0/50/100, contextual responses, sensitive cases, controlled variation, unsafe-looking text and existing query regressions. Browser checks exercise hosted and packaged-origin adapters, live preview, keyboard steps and endpoints, offline cold reload, navigation/refresh retention, ledger switching, isolated reset, unchanged financial tables/queues, and 320/393/768px reduced-motion layouts. These are simulated browser checks, not physical-device or live Apps Script certification.

## Verification for this increment

- `npm test` in tests: **209 tests passed**, including all existing 193 tests and 16 personality tests. Invariance checks cover all three presets at chaos 0/50/100, with frozen canonical/result objects; all five-point chaos settings are validated.
- `npm run test:browser` in tests: **10 scenario passes**, including all existing workflows and personality coverage in hosted and packaged-origin adapters. Final focused assistant checks also passed after reaction-pool tuning and the HTML-like category-name fixture. Preview, keyboard steps/endpoints, exact canonical UI text, unsupported/sensitive cases, offline cold reload, navigation/refresh persistence, ledger switching, defaults, quota denial, unchanged financial tables/queues, unsafe-looking names/notes and 320/393/768px reduced-motion layouts are covered. A Settings screenshot was inspected.
- Android `assembleDebug lintDebug testDebugUnitTest`: **passed**, with zero lint errors and three JVM tests (no failures/errors). The final bundled APK frontend was compared against Index.html, allowing only removal of hosted font/base tags.
- `git diff --check`: passed. Financial query source, backend operations, spreadsheet schemas, native source, credentials and signing configuration are unchanged.

These checks were local and use simulated browser adapters. No physical phone test, live Apps Script deployment test or remote Actions result is claimed. No release-signing operation was needed.
