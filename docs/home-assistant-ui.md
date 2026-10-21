# Home assistant UI revision

The question composer is directly on Home, above the financial summary. It starts as a compact input row; focusing the input expands the workspace. A labeled minimize control collapses it without clearing draft text or history. Settings retains configuration and Guide; no assistant entry button or chat modal remains. The Home section is static while the dashboard summary re-renders, preserving draft text, conversation and focused input across refreshes.

The design uses the ledger's green/paper palette, serif headings, a rounded question field and an icon submit control. Two lightweight suggested questions introduce supported wording. Results distinguish monetary totals, transaction rows, category proportions, comparison columns, no matches and unsupported requests. Each successful answer shows its saved-ledger time. New cloud writes mark the snapshot stale until refresh. Device offline status is separate from snapshot age; no claim of successful network reachability is inferred from navigator.onLine.

Conversation stays in memory, bounded to ten question/answer turns, with an accessible log, a clear control and a scrollable history. Form input has an accessible label, a 44px submit target and a focus indicator. Record notes render as text. SVG icons avoid font-dependent arrow glyphs.

Deploy: replace Index.html in Apps Script, save, and deploy a new version of the existing web-app deployment. Code.gs and the APK do not need changes for this UI revision.

Validation performed: ten Node snapshot/query tests passed. Chromium with mocked Apps Script data passed mobile keyboard submission, answer display, safe rendering of HTML-like notes, conversation and draft preservation across refresh, Settings/Guide navigation, suggested prompts, comparison layout, unsupported-question errors, clear conversation and horizontal overflow checks at widths 320, 393 and 768. A rendered mobile screenshot was inspected. Live Apps Script and phone testing of this revision remain to be done. Browser checks used the system Chromium and Playwright; no browser dependencies were added to the production app.

Offline writes, offline cold startup and the LLM remain separate unfinished work. The LLM stays last in the implementation order.

Settings opens with focus on the close button rather than the app-name input, avoiding an automatic mobile keyboard. Chromium checks verified initial compact height, expansion/minimization with preserved history, and Settings focus on the close button; native keyboard behavior should also be checked on the phone.
