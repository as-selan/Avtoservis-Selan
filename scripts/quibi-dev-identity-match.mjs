export function matchSyntheticCases(cases,links,quibiIds){
 const allowed=new Set(quibiIds);
 return cases.filter(row=>/^QA-SIM/i.test(String(row.summary??''))&&/^QA-SIM/i.test(String(row.problem_description??''))).flatMap(row=>{
  const link=links.find(item=>item.organization_id===row.organization_id&&item.entity_id===row.customer_id&&item.provider==='quibi'&&item.entity_type==='customer'&&item.sync_status==='ok'&&item.quibi_environment==='dev'&&allowed.has(String(item.external_id)));
  return link?[{caseId:row.id,customerId:row.customer_id,quibiCustomerId:link.external_id}]:[];
 });
}
