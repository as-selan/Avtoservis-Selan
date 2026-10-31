# Aktivni migracijski manifest

Main ima samo foundation; DEV ima vseh 32 vsebin. To ni navodilo za replay na že razviti bazi. Pred izvajanjem primerjaj ciljno zgodovino in shemo.

1. `20260912181715_secure_foundation_slice_a.sql` — DEV version `20260912181715`.
2. `20260928173816_20260913174315_customers.sql` — DEV version `20260928173816`.
3. `20260928175048_20260913174349_vehicles.sql` — DEV version `20260928175048`.
4. `20260928175103_20260913174900_service_requests.sql` — DEV version `20260928175103`.
5. `20260928175120_20260913214500_create_manual_service_request_intake.sql` — DEV version `20260928175120`.
6. `20260928175203_20260914003000_appointments_foundation.sql` — DEV version `20260928175203`.
7. `20260928175302_20260914024500_create_web_service_request_intake.sql` — DEV version `20260928175302`.
8. `20260928175317_20260914033000_create_service_request_completion_links.sql` — DEV version `20260928175317`.
9. `20260928175331_20260917100000_create_offer_preparations.sql` — DEV version `20260928175331`.
10. `20260928175548_20260919140000_create_offer_review_customer_approval.sql` — DEV version `20260928175548`.
11. `20260928175600_20260926120000_quibi_read_links.sql` — DEV version `20260928175600`.
12. `20260928175615_20260927085839_manual_quibi_estimate_v1.sql` — DEV version `20260928175615`.
13. `20260928175644_20260927101529_preliminary_inspection_v1.sql` — DEV version `20260928175644`.
14. `20260928175656_20260927102728_manual_slot_offer_v1.sql` — DEV version `20260928175656`.
15. `20260928175707_20260928163011_protect_public_web_intake_v1.sql` — DEV version `20260928175707`.
16. `20260928183213_quibi_vehicle_links.sql` — DEV version `20260928183213`.
17. `20261004162925_published_fixed_price_path.sql` — DEV version `20261004162925`.
18. `20261004162947_review_intake_and_fix_published_url.sql` — DEV version `20261004162947`.
19. `20261004163011_fixed_price_service_match.sql` — DEV version `20261004163011`.
20. `20261007164809_quibi_dev_operation_journal.sql` — DEV version `20261007164809`.
21. `20261008192531_contact_policy_and_completion_review.sql` — DEV version `20261008192531`.
22. `20261010183422_unified_quibi_workflow.sql` — DEV version `20261010183422`.
23. `20261011190311_quibi_dev_business_journal.sql` — DEV version `20261011190311`.
24. `20261012171839_allow_recorded_customer_decision_without_delivery.sql` — DEV version `20261012171839`.
25. `20261014155456_quibi_dev_rejected_business_create_retry.sql` — DEV version `20261014155456`.
26. `20261014184946_team_case_work_and_private_evidence.sql` — DEV version `20261014184946`.
27. `20261014212032_case_vehicle_resolution.sql` — DEV version `20261014212032`.
28. `20261017195305_case_work_manager_review_closure.sql` — DEV version `20261017195305`.
29. `20261017233803_completion_existing_customer_vehicle.sql` — DEV version `20261017233803`.
30. `20261024120000_automatic_offer_drafts.sql` — DEV version `20261024094647`.
31. `20261024123000_save_automatic_offer_edits.sql` — DEV version `20261024100001`.
32. `20261024124000_automatic_offer_identity_and_notifications.sql` — DEV version `20261024100417`.

Na DEV: ne izvajaj ponovno. Za nov prazen cilj: foundation, nato preostale po timestamp vrstnem redu, po uskladitvi zadnjih treh oznak. Za produkcijo: točen manjko ni potrjen brez njenega inventarja. Arhiv in pending-migrations nista del tega seznama.
