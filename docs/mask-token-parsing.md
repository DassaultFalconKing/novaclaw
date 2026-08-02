# Mask-Token Parsing & Tool Recovery

## Overview

When NovaClaw communicates with LLM providers using the OpenAI Chat Completions API
(protocol: `openai-chat`), it expects tool calls to arrive in the structured `tool_calls`
array of each response chunk. However, several model families — notably **Qwen** (especially
qwen3_coder, qwen2.5-coder), **Hermes**, and some GPT-oss variants — emit tool calls
incorrectly: the call lands in the assistant's `content` text field instead of the
`tool_calls` channel.

This means the stream parser sees a "finished" text response with no tool calls and
would normally stop the turn, causing the agent to silently drop the tool call and
potentially enter a **doom loop** (repeatedly generating the same answer with no action).

NovaClaw's **tool-recovery** subsystem (`packages/llm/src/protocols/utils/tool-recovery.ts`)
fixes this by scanning the assistant text for embedded tool-call patterns and extracting
them back into structured events.

---

## The Mask-Token Problem

### What are `<|mask_start|>` / `<|mask_end|>` tokens?

These are special tokens emitted by models using **Masked Token Prediction (MTP)**, a
technique employed by Qwen and related architectures. During generation, the model's
output gets wrapped in these tokens at structural boundaries:

```
<|mask_start|> write(path="perm-test.txt", content="hello") <|mask_end|>
```

They leak into the text stream visible to the client-side parser. Without handling,
they corrupt the text content and can prevent recovery of the tool call.

### Where they appear

- Wrapped around paren-syntax calls: `<|mask_start|> write(...) <|mask_end|>`
- Wrapped around XML calls: `<|mask_start|><write>...</write><|mask_end|>`
- Sometimes appearing alone with no actual content — the model produces only mask
  tokens and `</think>

<|mask_start|>` tags, yielding zero useful output (the "debris only" state).

### How the parser handles them

In `recoverToolCallsFromText`, mask tokens are stripped **before** any recovery regexes
run:

```typescript
const cleaned = text.replace(/<\|mask_[a-z]+\|>/g, " ")
```

This replacement is **recovery-only** — the displayed text in the UI remains untouched.
The regex specifically targets `mask_*` variants; it does NOT strip `<|channel|>` or
other harmony tokens (those are handled separately by `scrubName`).

### The `debrisOnly` check

When the parser finishes a turn with zero tool calls, it checks whether the content is
"debris only":

```typescript
const debrisOnly = (content: string) =>
  content
    .replace(/<\|[^|>]*\|>/g, "")   // strip ALL harmony/mask tokens
    .replace(/<\/?think>/g, "")      // strip reasoning tags
    .trim().length === 0
```

If debris-only, the parser attempts a **last-resort recovery**: it scans the `reasoning`
channel (where a derailed thinking model often left the complete tool call) for
recoverable calls. This is the final fallback before the turn is considered failed.

---

## Recovery Pipeline

The recovery runs in a fixed priority order. Each stage is whitelist-gated against the
known tool names, so ordinary prose, code, or HTML is never misread as a call.

### Stage 1: Hermes `<<tool_call>>` blocks

Models like Hermes emit calls wrapped in special tokens:

```
<tool_call>{"name":"read","arguments":{"filePath":"a.ts"}}</tool_call>
```

The parser extracts JSON from inside `<<tool_call> ...</tool_call>>` delimiters, handles unclosed blocks,
normalizes flat args (siblings of `name`) into nested `arguments`, and deduplicates.

### Stage 2: Bare JSON

A raw JSON object or array carrying `"name"` as the entire message content:

```json
{"name":"read","arguments":{"filePath":"a.ts"}}
```

or

```json
[{"name":"read","arguments":{"filePath":"a.ts"}},{"name":"list","arguments":{"path":"/"}}]
```

Parsed via `tolerantJson`, which tries native `JSON.parse` first, then falls back to
`repairToolJson` (a JSON repair library) for malformed input.

### Stage 3: XML-ish tags

Several malformed shapes observed live:

| Shape | Example |
|-------|---------|
| Standard XML | `<read><filePath>x</filePath></read>` |
| `function=` opener | `<function=write>
### Stage 3: XML-ish tags

Several malformed shapes observed live:

| Shape | Example |
|-------|---------|
| Standard XML | `<read><filePath>x</filePath></read>` |
| `function=` opener | `<function=write>
