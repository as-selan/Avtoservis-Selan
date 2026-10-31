/** No automatic activation or migration. Audited selection for the existing hosted project. */
export const hostedMigrationReview=[
 {file:'../migration-archive/legacy-local-work-orders/20261010220000_work_orders_v1.sql',requiredForDirectQuibi:false,purpose:'Internal assignments, repair progress and notes; not a Quibi business order'},
 {file:'../migration-archive/legacy-local-work-orders/20261010223000_work_order_photos.sql',requiredForDirectQuibi:false,purpose:'Legacy photo reads only; no new bucket or upload'},
 {file:'../migration-archive/legacy-local-work-orders/20261011010000_work_order_quibi_documents.sql',requiredForDirectQuibi:false,purpose:'Legacy internal-task ID/SHA references; direct case path uses journal'},
 {file:'../migration-archive/legacy-local-work-orders/20261011020000_quibi_business_document_operations.sql',requiredForDirectQuibi:false,purpose:'Broad legacy migration; do not apply for DEV-only activation'},
 {file:'../pending-migrations/20261011120000_explicit_vehicle_with_shared_registration.sql',requiredForDirectQuibi:false,purpose:'Ambiguous registration resolution in intake; evaluate existing data separately'},
 {file:'../migration-archive/legacy-local-work-orders/20261011150000_assigned_mechanic_access.sql',requiredForDirectQuibi:false,purpose:'Legacy internal-task assignments; current team work uses service_case_assignments'},
] as const;
export const quibiPhotoApiRequirement={
 scope:['company','vehicle_id','business_work_order_id'],
 operations:['multipart binary upload with MIME, maximum size, idempotency key and returned attachment ID','list attachments with verified company/vehicle/work-order ownership','authenticated download or expiring preview URL','attach existing attachment to vehicle and business work order with audit trail'],
 endpointStatus:'No documented endpoint confirmed; request exact routes, permissions, payloads and response schemas from Quibi',
 persistence:'No new Selan/Supabase photo storage',
} as const;

export const directDevJournalMigration='20261011190311_quibi_dev_business_journal.sql';
export const requiredPreviewActivation={QUIBI_DEV_TEST_RECIPIENT:'Required validated test mailbox, different from the customer email',QUIBI_DEV_WRITE_ENABLED:'Enable only after approved journal installation and a separately approved DEV operation',QUIBI_DEV_LOCAL_WRITE_ENABLED:'Must remain disabled in Preview',QUIBI_DEV_LOCAL_SEND_ENABLED:'Must remain disabled in Preview'} as const;

export function previewDevActivationReadiness(env:Record<string,string|undefined>){
 if(env.APP_ENV!=='preproduction'||env.QUIBI_MODE!=='dev'||env.VERCEL_ENV!=='preview')return null;
 const missing:string[]=[];
 for(const key of ['QUIBI_DEV_USERNAME','QUIBI_DEV_PASSWORD','SUPABASE_SERVICE_ROLE_KEY'])if(!env[key])missing.push(key);
 const recipient=env.QUIBI_DEV_TEST_RECIPIENT??'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||/(^|\.)(test|invalid|localhost|example\.(com|org|net))$/i.test(recipient.split('@')[1]??''))missing.push('QUIBI_DEV_TEST_RECIPIENT');
 return {missing,writeEnabled:env.QUIBI_DEV_WRITE_ENABLED==='1',localOverrideEnabled:env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1'};
}
