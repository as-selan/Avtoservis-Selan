# Samodejne postavke iz povprašševanja – PR #19

## Vzrok in popravek
Pri dejanskem primeru F93CFB37 je `service_wanted` kategorija Avtomehanika. Tri zahteve so v `problem_description`; zadnja vsebuje tipkarsko napako. Prejšnja začetna izbira je preverjala samo celoten `service_wanted` in bila odvisna od AI predlogov.

Urejevalnik zdaj prebere obe polji, ohrani vsako zahtevo, uporabi samo enolično točno ujemanje imena ali šifre iz svežega Quibi kataloga in cenik potrjene stranke. Različni ceniki istega artikla ne povzročijo dodatnih vrstic. Nejasno ujemanje, tipkarska napaka ali manjkajoča postavka ostanejo označena posamezna vrstica brez izmišljene cene. Pri časovnih enotah se količina ne ugiba. Enolična vrsta prodaje in skladišče se še naprej izbereta samodejno.

## Preverjanje
- 44/44 testov: vrstice, cene, pregled, identiteta, CREATE dnevnik in zaščita pred podvajanjem.
- TypeScript brez napak.
- Sintetični hidratirani zasloni: 1440, 390 in 350 px; dve izpolnjeni postavki in ena nejasna, brez ponovljenih potrditev.
- Dejanski prijavljeni E2E in dejanski Quibi DEV CREATE: NEPREVERJENO. Sintetični brskalniški CREATE uporablja testni odgovor, ne ustvari dokumenta.
- Samodejni varnostni pregled je zavrnil prenos celotnih Preview skrivnosti v lokalno datoteko. Prenos ni izveden. WRITE/SEND in produkcijske nastavitve niso spremenjeni.

## Prebrane smernice in uporabljene veščine
- C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md
- C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/CLAUDE.md
- C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md
- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md
- node_modules/next/dist/docs/01-app/02-guides/forms.md
