# Future optional conversation provider (not implemented)

Production Salary Ledger contains no model runtime, weights, inference service or native AI bridge. Its deterministic queries, command registry, validated previews, saves and personality templates work without model files. This phase does not change the isolated benchmark.

Financial authority stays with LedgerQuery, LedgerPending, LedgerOperations and the existing atomic outbox/server receipts. Personality text occupies a separate adjacent paragraph: it cannot supply or replace transaction details, totals, caveats, errors or synchronization status. After a confirmed local enqueue, the current deterministic reaction uses the selected per-ledger preset/chaos and a conservative event context. Queuing is not synchronization or an achievement; no celebration is inferred from an amount or a category name. Expenses and fund movements use restrained wording because necessity/distress cannot be inferred from the request.

## Narrow future interface

Conceptual provider (not a production API or callable JavaScript bridge):

```typescript
type ConversationRequest = {
  invocationId: string;         // one explicit user gesture
  ledgerSessionToken: string;  // opaque identity for invalidation, not a credential
  personalityId: 'supportive-bestie' | 'financial-gremlin' | 'sarcastic-accountant';
  chaos: number;                // validated 0..100, step 5
  language: 'English' | 'Filipino' | 'Taglish';
  context: 'casual' | 'entry-followup' | 'verified-milestone';
  sensitivity: 'ordinary' | 'sensitive';
  prompt: string;              // bounded, escaped, deliberately selected text
};
type ConversationResult = {
  invocationId: string;
  status: 'completed' | 'cancelled' | 'unavailable' | 'failed';
  reaction?: string;            // bounded plain text; never an executable payload
};
interface ConversationProvider {
  invoke(request: ConversationRequest, cancellation: AbortSignal): Promise<ConversationResult>;
  cancelAndRelease(reason: string): Promise<void>;
}
```

The provider has no ledger snapshot, RPC handlers, transaction schemas, PIN, pairing credentials, database handle, financial calculator, sync callback or unrestricted Android method access. No provider-selected capability or financial action is permitted. Ordinary save reactions stay deterministic; a future separate, explicit “AI conversation” gesture is required for inference. A result is discarded if its invocation/session no longer matches. Model output is untrusted plain text; reject contradictory commentary and fall back rather than attempting to repair canonical facts. Define and test that policy before integration.

## Serialized lifecycle

`unloaded → explicit invocation → verify/import availability → loading → generating → releasing → unloaded`.

Default launch, refresh, dashboard rendering, querying, command parsing, draft editing, confirmation, saving, sync, navigation and personality-setting changes never initialize a model/context. A single worker owns loading, inference and destruction. Cancellation signals an atomic abort; destruction waits for the active call to return. Model verification and all native work stay off the UI thread. Prefer unload immediately after every invocation, including failures; no resident service, hidden warmup, automatic prefix cache or permanent inference context.

Cancel and serialize release on user Cancel, abandonment, background, lock/revocation, ledger/session change, runtime/model-loading error and Activity destruction. Cancellation during loading is handled as carefully as during generation. Do not destroy resources concurrently with inference. Subsequent invocations wait for release; at most one model is resident. Provider errors and OOM must leave deterministic functions available. No model installed/unsupported device/timeout/cancel/failed verification means deterministic fallback, not a broken assistant. Keep file integrity verification; optimize verification separately only with evidence.

## Required future tests before production inference

A fake provider with load/context/release counters must show zero initialization on every ordinary app action, exactly one explicit invocation, release after completion/error/cancel, no overlapping loads during lifecycle transitions, no stale result after ledger changes, and deterministic fallback when the provider is missing. Device testing must verify memory release and responsiveness on both target phones. No production inference should be claimed from current benchmark or documentation tests.
