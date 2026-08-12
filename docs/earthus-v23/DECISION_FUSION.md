# PR-10 Grounded Decision Fusion — Shadow Contract

Fusion is not a decision maker. It may assemble only claims already named in an
evidence ledger and preserve their source URL, observed time, provenance,
precision and license state. The current implementation makes zero external
model/tool calls and accepts no model text as fact.

- Any missing citation, unsafe plan, non-read-only intent, or invalid base
  decision fails closed.
- Safety `UNKNOWN`/`DANGER` or a positive-recommendation block returns
  `WITHHELD_SAFETY_OR_EVIDENCE`.
- Fusion copies the existing decision recommendation without upgrading it.
- It has `action=null`, `toolCalls=0`, `externalModelCalls=0` and no mutable
  state. It has no public UI consumer.

Production requires approved live-source rights/freshness, evaluated model and
cost policy, prompt-injection/red-team evidence, tool allowlists and user-facing
provenance/uncertainty presentation. No action route may be added from Fusion.
