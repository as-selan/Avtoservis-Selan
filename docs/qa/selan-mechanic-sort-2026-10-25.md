# Moje delo — vrstni red nalogov

Popravek uporablja obstoječi seznam in Realtime, brez novih nastavitev, filtrov ali obrazcev. Aktivni nalogi so pred work_completed/zaklenjenimi/zaključenimi; obe skupini sta razvrščeni po created_at dodelitve padajoče. Opombe, fotografije in spremembe stanja ne spreminjajo datuma dodelitve. Manjkajoči datumi so zadnji v svoji skupini; vezani datumi imajo determinističen vrstni red. Vodjev obstoječi pregled po zadnji aktivnosti ni spremenjen.

DEV SELECT je potrdil vrstni red istega mehanika: aktivni 2176935, nato zaključena 2176933 in 2176898. Obstoječa publikacija supabase_realtime že vsebuje service_case_assignments; gostovana konfiguracija ni spremenjena. WorkshopRealtime je že nameščen v mehanikovi postavitvi, spremlja vse spremembe dodelitev in uporablja obstoječi router.refresh scheduler.

Nova regresija preveri skupini, najnovejšo dodelitev, neodvisnost od poznejše aktivnosti, manjkajoči datum in da se vhodni seznam ne spremeni. Obstoječi browser scenarij preveri vrstni red ter opazuje spremembo stanja iz drugega zavihka brez ročnega reload. Samo preverjeni disposable CI container dobi ustrezno Realtime publikacijo, enako obstoječi DEV nastavitvi; SQL ni izveden na gostovani bazi. Končni testi in Preview so navedeni v PR.

Ni podatkovnih migracij, RLS sprememb, Quibi operacij ali produkcijske objave. Prijavljeni gostovani browser E2E ni potrjen; dejansko stanje je preverjeno samo s scoped DEV SELECT.

Prebrana pravila in veščine: aktivni koren C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1 (AGENTS.md; prejšnja usmeritev CLAUDE.md in Next use-client guide ostaja); C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md. Za READ in DEV objavo veljajo že prebrane C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md in C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md.
