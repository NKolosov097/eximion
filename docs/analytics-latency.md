# Analytics latency audit

Measured on **2026-10-09 at 03:14:36–03:14:37 UTC** against backend revision `eximion-backend-00008-njt` in `europe-west3`. Six sequential, read-only HTTPS requests used a persistent connection: four analytics GETs, one CORS OPTIONS and one health GET. Response contents and authorization headers were not recorded. Cold-start observations below come from existing Cloud Run logs; no restart was forced.

| Observation | Time | Evidence |
| --- | ---: | --- |
| Cold analytics OPTIONS, 03:11:00.424986 UTC | 6,689 ms | Cloud Run request log |
| New instance to successful startup probe, 03:11:00.449485–03:11:07.263885 UTC | 6,814 ms | Cloud Run system logs |
| First analytics GET after startup, 03:11:07.579830 UTC | 1,096 ms | Cloud Run request log |
| First measured analytics GET on a new client connection | 404 ms | Client stopwatch; DNS/TCP/TLS completed at 220 ms |
| Three subsequent analytics GETs, 30/7/90 days | 186 / 196 / 174 ms | Client stopwatch, reused connection |
| Same three GETs inside Cloud Run | 117 / 127 / 105 ms | Request logs correlated by trace ID |
| Same three GETs before trace export | 19 / 21 / 17 ms | Application operation logs |
| SQL execution per warm analytics request, two queries combined | 7–8 ms | `db.query` operation logs |
| Warm OPTIONS | 121 ms client; 51 ms Cloud Run | Same measurement session |

## Findings

1. **Cold startup is the main observed delay.** The service has no configured minimum instances and the slow OPTIONS coincides with a new instance starting. Startup CPU boost is already enabled. These observations support scale-to-zero startup as the cause of the multi-second first load; the sample does not establish a latency percentile.
2. **Initial application work also costs time.** The first GET logged 1,002 ms before export, including 332 ms in `analytics.read`, while its SQL queries totaled only 22 ms. Lazy database/ORM/runtime initialization is an inference from these differences and the code path, not a separately measured breakdown.
3. **Trace export extends response time.** `TelemetryMiddleware` logs completion, then awaits the root span's export before sending the response. Warm platform latency exceeds the logged application duration by roughly 80–106 ms. Export contributes to that gap; platform overhead is not separated. The 1.5-second export wait is a ceiling, not a fixed delay, and these observations do not show that ceiling being reached.
4. **The browser currently pays for cross-origin preflight.** Separate frontend/API origins and the author header require OPTIONS when the browser's preflight cache does not apply. The planned account flow's same-origin BFF should remove this browser-to-API preflight from that flow. It has not yet been implemented and measured in this audit; its total latency benefit remains unverified.

## Proportionate next steps

- Optionally keep one backend instance ready if first-visit latency matters more than idle cost. This is a paid configuration choice, not applied by this audit. Minimum instances reduce cold starts but do not guarantee their complete elimination. See [Cloud Run minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances).
- Leave SQL and indexes unchanged: warm database work is only 7–8 ms in the observed workload. These measurements do not justify a query rewrite, additional indexes or caching private results.
- Leave trace flushing unchanged for now: the measured overhead is modest, and removing the wait could compromise export when request-based CPU allocation stops after a response. See the [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract). Measuring successful export duration and full response duration would resolve the current logging blind spot before changing this behavior.
- Re-measure the account/BFF flow after deployment, including its first and subsequent requests, before deciding on infrastructure changes.

No configuration, application code, database contents or deployed revisions were changed. No load test, p95/p99 study or independent cold-start reproduction was performed.
