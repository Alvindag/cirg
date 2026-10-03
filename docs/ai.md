# AI features and governance

Two kinds of AI, kept apart on purpose.

## 1. Rule-based analytics (always on, no external model)
Explicit, explainable calculations over data already in the system. Each result lists the factors behind it.
| Feature | Where | How it works |
|---|---|---|
| Customer scoring | web Insights → Customer scores; `GET /ai/customers/scores`, `/ai/customers/{id}/score` | **Potential** (segment, product interest) and **engagement** (recency, visit frequency vs target, call outcomes, sample uptake) combine into a score and a status (Thriving / Healthy / Needs attention / At risk). Can hint that a customer's segment looks wrong. |
| Next best actions | mobile Today tab; `GET /ai/next-best-actions` | Due follow-ups, visits overdue against the target frequency, quiet customers after a negative or open call, "offer samples" after a positive call when the rep carries stock, stock expiring within 60 days. Cached on the device for offline use. |
| Opportunity prediction | web Insights → Opportunities; `GET /ai/opportunities?productId=` | A fixed-weight logistic **heuristic** (interest, response when the product was discussed, segment, recent contact, samples). Ranks customers for attention; it is **not a sales forecast** and is uncalibrated until ERP sales data can be used to train a real model. |
| Territory optimisation | web Insights → Territory balance; `GET /ai/territories/balance`, `POST /ai/territories/moves/apply` | Required calls per month against rep capacity (default 160 per rep per month) per territory; suggests moving customers from overloaded to the nearest territory with spare capacity. Suggestions only; an administrator applies them (audited). |
| Route optimisation | mobile Today tab; `POST /ai/routes/optimize` | Nearest neighbour plus 2-opt over straight-line distance; never worse than the rep's own order; applied only when the rep accepts. |

## 2. Generative AI (Azure OpenAI; off until switched on)
| Feature | Flow |
|---|---|
| Voice-to-text call reporting | Rep records a voice note → it uploads → *Transcribe* → server sends the audio to the Whisper deployment → transcript shown as a **draft** → rep edits and adds it to the call notes, or discards. One paid transcription per voice note. |
| Visit summary generation | Rep saves the call report (it syncs) → *Draft summary with AI* → server sends redacted notes and transcripts to the chat deployment → structured draft (summary, key points, objections, follow-ups, sentiment) → rep edits, picks follow-ups, and accepts or discards. Accepted text is added to the notes on the device and follow-ups become tasks. |

### Safeguards (also listed live under web Insights → AI governance)
- **Opt-in**: off globally (`Ai:Enabled=false`) and per organisation. An administrator switches it on (audited).
- **Redaction before sending**: emails, phone numbers, long digit strings, Ghana Card numbers, links, and the customer's and rep's names. This is a safety net, not a guarantee; free text can still hold other details. Reps are told in the app not to dictate patient information.
- **Drafts only**: nothing is used until a person accepts it; edited summaries are re-validated; every decision is recorded.
- **Untrusted input**: notes are placed in a delimited block and the model is told to ignore instructions inside it. Answers must be valid JSON of the expected shape; products the rep did not record are dropped; lengths are capped; unusable answers are refused and logged as failures.
- **Model-use register**: every call is a row (`AiOutput`): who, feature, model deployment, prompt **hash** (never the prompt), tokens, latency, status, accepted/rejected. Visible to Admin, NSM and Executive.
- **Limits**: `Ai:DailyLimitPerUser` (default 40) and input length caps; voice notes over 25 MB are not transcribed.
- **Privacy**: recordings can be transcribed only by their owner. Managers cannot trigger it.
- **Errors**: provider details are never shown to users; they get a plain explanation.
- **Authentication**: managed identity to Azure OpenAI in production (no keys in config). `Ai:ApiKey` is for local development only.

### Setting it up
1. Create an Azure OpenAI resource in a region you have approved (check data-residency and the Data Protection Act, 2012 (Act 843) assessment), deploy a chat model (e.g. `gpt-4o-mini`) and `whisper`.
2. Give the API's managed identity the **Cognitive Services OpenAI User** role on the resource.
3. Configure: `Ai:Enabled=true`, `Ai:Provider=azure`, `Ai:Endpoint`, `Ai:ChatDeployment`, `Ai:TranscriptionDeployment`.
4. An administrator opens Insights → AI governance and switches generative AI on for the organisation.
5. Review Microsoft's current terms for Azure OpenAI data handling (abuse monitoring, no training on your data) against DAS's requirements; keep that review with the register.

### Known limits
- Transcription quality varies by accent and background noise, and for Twi and other Ghanaian languages it may be poor; check before relying on it. A language hint can be sent.
- Summaries can still be wrong or miss nuance; that is why a person reads and edits them.
- Generative calls need a connection (offline reps get their notes saved and can use AI later). Transcription is synchronous (fine for voice notes of a few minutes); very long recordings would need a background queue.
- Not yet done: automatic evaluation of summary quality (sample reviews of accepted/edited drafts), per-tenant cost caps beyond the per-user limit, content-safety logging review, multilingual prompts.
