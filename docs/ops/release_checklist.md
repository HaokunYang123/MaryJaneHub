# Release Readiness Checklist

Run these commands in order and keep results for the release record.

1) Env + DB + evidence readiness
   - `npm run healthcheck`
   - Green = all sections PASS; WARN means optional items missing; FAIL blocks release.

2) Assistant regression
   - `npm run assistant:test`
   - Green = SUMMARY: 10/10 passed.

3) Assistant audit coverage
   - `npm run assistant:audit:test`
   - Green = Audit test PASSED.

4) Assistant integration (live services)
   - `npm run assistant:integration`
   - Green = 6/6 PASS in summary.

Optional (when relevant):
5) Evidence v2 verification (requires EVIDENCE_REQUEST_ID)
   - `npm run verify:evidence:v2`
   - Green = PASS: Evidence Packet v2 verified.

6) Drive retry / embedding cache checks
   - `npm run test:drive-retry`
   - `npm run test:embedding:cache`

Notes:
- If any FAIL occurs, investigate and rerun the failing step.
- Do not paste secrets into logs; share only PASS/WARN/FAIL and sanitized refs. 
