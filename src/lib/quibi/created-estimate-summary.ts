type CreatedDetail={id:string;customerId:string;vehicleId?:string;number?:string;amount:string;contentSha256:string};
export type CreatedEstimateSummary={id:string;number:string|null;amount:string;customerId:string;linked:boolean};
/** The success card uses the freshly read document, never the entered amount. */
export function createdEstimateSummary(detail:CreatedDetail,expected:{id:string;customerId:string;vehicleId:string;sha:string;amount:number;alternativeAmounts?:number[]},localCustomerId:string,linked:boolean):CreatedEstimateSummary {
 const amount=Number(detail.amount.replace(',', '.'));
 if(detail.id!==expected.id||detail.customerId!==expected.customerId||detail.vehicleId!==expected.vehicleId||detail.contentSha256!==expected.sha||!Number.isFinite(amount)||![expected.amount,...(expected.alternativeAmounts??[])].some(value=>Math.round(amount*100)===Math.round(value*100)))throw Error('QUIBI_CREATED_ESTIMATE_CHANGED');
 return {id:detail.id,number:detail.number??null,amount:detail.amount,customerId:localCustomerId,linked};
}
