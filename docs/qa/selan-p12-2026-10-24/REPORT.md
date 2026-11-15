# P1.2 – invoice display

Targeted fix for REA P1.1 FAIL #4. Confirmed identity suppresses the vehicle resolution component before remote reads or readiness RPC. A missing vehicle retains explicit confirmation; unresolved links retain corrections without offering another CREATE. Confirmed identity can be reviewed through the existing customer/vehicle link under More details.

Unavailable AI configuration and DEV activation variable lists are no longer rendered on the business case page. Existing AI drafts, communication drafts, document history and actionable form-specific blockers remain. No prices, documents, authorization rules or database records changed.

Verification: 4 new server-render/presentation regression tests; 483 existing tests; TypeScript and ESLint pass. Actual isolated invoice components checked at 1440/390/350 px with no overflow or page errors, invoice dates preserved on reload, reviewed work needs no repeat checkbox, WRITE-off has no CREATE button. Screenshots and JSON are in estimate/. These are synthetic component fixtures, not authenticated A73 E2E. No Quibi CREATE/SEND executed. Authenticated DEV must be rerun by REA on A73; expected amount remains 111.87 EUR.

Sources read: active AGENTS.md; C:/Users/Admin/avtoservis-selan/docs/qa/selan-rea-e2e-p11-472e043/REPORT.md; local Next use-server.md. Skills applied: ai-orchestrator, systematic-debugging, verification-before-completion, deploy-to-vercel (paths under C:/Users/Admin/.agents/skills/).
