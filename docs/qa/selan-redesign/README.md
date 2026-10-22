# PR #19 – poenostavitev delovnega prostora

Nadzorna plošča: Novo, Čaka odločitev, V delu, Zaključeno; eno iskanje in naslednje opravilo pri primeru. Primer: povzetek, zahtevane/pripravljene storitve, eno glavno dejanje; ostale vsebine ostanejo zložene. Mehanik: vozilo, dodeljeno delo, začetek, opomba/fotografija in zaključek.

Predračun ohrani vse zahtevane storitve. Kadar katalog nima zanesljive postavke, uporabnik dopolni prosto storitev, manjkajočo količino in ceno. Cene niso ocenjene. Strežnik ponovno preveri enote, DDV, zneske in identiteto ter ohrani dnevnik proti dvojnemu CREATE. Privzete nastavitve so veljavne samo, če obstajajo v svežih Quibijevih šifrantih.

DEV pošiljanje ni pogoj za nadaljevanje. Dokument ni označen kot poslan; dejanska ali označena sintetična odločitev se zabeleži ločeno. Pošiljanje 277127 ni ponovljeno.

## Dokazi in omejitve

- 21 testov urejevalnika in strežniških vrstic: uspešno, vključno s tremi prostimi storitvami brez branja kataloga, napačnimi enotami/DDV, praznimi cenami/količinami in preračunom zneskov.
- 42 scenarijev primera pri 1440/390/350 px: uspešno; [rezultati](../selan-p0-2026-10-22/browser-results.json).
- Posnetki izoliranih dejanskih komponent uporabljajo izključno sintetične podatke in niso dokaz prijavljenega E2E.
- Prijavljeni uporabniški E2E ostaja nepreverjen: povezava do uporabnikove prijavljene IAB seje ni dostopna avtomatizaciji; ločen brskalnik nima seje. To ni trditev, da uporabnik nima dostopa.
- Raziskava Evoca ni bila najdena v dostopnih projektnih dokumentih; nobena ugotovitev ni pripisana Evoci.

## Prebrana pravila in uporabljene veščine

Aktivni worktree: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1`.
Prebrano: `AGENTS.md`, `CLAUDE.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` in `docs/dashboard-v1-preservation.md` v tem worktreeju; `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`.
Veščine: `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`, `product-designer/SKILL.md`, `security-review/SKILL.md`, `superpowers/dispatching-parallel-agents/SKILL.md`, `superpowers/verification-before-completion/SKILL.md`, `deploy-to-vercel/SKILL.md` (isti koren); Vercel `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md`.

- TypeScript za trenutne projektne izvore: uspešno (`qa-visual/tsconfig-current.json`, izključeni samo generirani arhivski deploymenti). ESLint spremenjenih komponent in Quibi poti: uspešno.
- Hidrirani prikazi nadzorne plošče in mehanika: 6/6 pri 1440/390/350; brez prelivanja in napak strani.
- Predračun: vse tri širine, en obrazec, pregled proste storitve, brez podvojenih potrditev, brez prelivanja.
