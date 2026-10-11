/** No automatic activation or migration. Audited selection for the existing hosted project. */
export const hostedMigrationReview=[
 {file:'20261010220000_work_orders_v1.sql',requiredForDirectQuibi:false,purpose:'Internal assignments, repair progress and notes; not a Quibi business order'},
 {file:'20261010223000_work_order_photos.sql',requiredForDirectQuibi:false,purpose:'Legacy photo reads only; no new bucket or upload'},
 {file:'20261011010000_work_order_quibi_documents.sql',requiredForDirectQuibi:false,purpose:'Legacy internal-task ID/SHA references; direct case path uses journal'},
 {file:'20261011020000_quibi_business_document_operations.sql',requiredForDirectQuibi:true,purpose:'Business journal kinds, atomic UPDATE/SEND conflicts; optional legacy reference audit'},
 {file:'20261011120000_explicit_vehicle_with_shared_registration.sql',requiredForDirectQuibi:false,purpose:'Ambiguous registration resolution in intake; evaluate existing data separately'},
 {file:'20261011150000_assigned_mechanic_access.sql',requiredForDirectQuibi:false,purpose:'Internal mechanic assignments and RLS; needed for team work, not Quibi document CREATE'},
] as const;
export const quibiPhotoApiRequirement={
 scope:['company','vehicle_id','business_work_order_id'],
 operations:['multipart binary upload with MIME, maximum size, idempotency key and returned attachment ID','list attachments with verified company/vehicle/work-order ownership','authenticated download or expiring preview URL','attach existing attachment to vehicle and business work order with audit trail'],
 endpointStatus:'No documented endpoint confirmed; request exact routes, permissions, payloads and response schemas from Quibi',
 persistence:'No new Selan/Supabase photo storage',
} as const;
