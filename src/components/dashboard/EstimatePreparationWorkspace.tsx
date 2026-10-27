"use client";
import {useEffect,useState} from "react";
import {PrepareOfferButton} from './PrepareOfferButton';
import {QuibiDevWritePanel} from './QuibiDevWritePanel';
import {LinkManualEstimateForm} from './LinkManualEstimateForm';
import type {EstimateComposerProps} from './EstimateComposer';
/** One ordinary editor; manual document identity verification is an optional separate path. */
export type EditorEnrichment={choices?:EstimateComposerProps['choices'];catalogOptions:NonNullable<EstimateComposerProps['catalogOptions']>;operationState?:string;writeReady:boolean};
export function EstimatePreparationWorkspace(props:EstimateComposerProps & {enrichment?:Promise<EditorEnrichment>}){
 const [enriched,setEnriched]=useState<EditorEnrichment|null>(null);
 useEffect(()=>{let active=true;if(props.enrichment)void Promise.resolve(props.enrichment).then(value=>{if(active)setEnriched(value)}).catch(()=>{});return()=>{active=false}},[props.enrichment]);
 const {enrichment,...editor}=props;void enrichment;
 const current=enriched?.choices;const prior=editor.choices?.defaults;const mergedChoices=current?{...current,defaults:{...current.defaults,...(!current.defaults?.saleTypeId&&current.saleTypes.some(c=>c.id===prior?.saleTypeId)?{saleTypeId:prior?.saleTypeId}:{}),...(!current.defaults?.warehouseId&&current.warehouses?.some(c=>c.id===prior?.warehouseId)?{warehouseId:prior?.warehouseId}:{})}}:editor.choices;
 const merged=enriched?{...editor,enrichmentPending:false,choices:mergedChoices,catalogOptions:[...enriched.catalogOptions.filter(o=>!editor.catalogOptions?.some(saved=>saved.key===o.key)),...(editor.catalogOptions??[])],operationState:enriched.operationState,mode:enriched.writeReady?'create' as const:'prepare' as const}:{...editor,enrichmentPending:!!props.enrichment};
 return <div className="space-y-4" data-estimate-workspace><QuibiDevWritePanel {...merged}/><details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Napredno – poveži obstoječ predračun</summary>{props.offerPrepared===false?<div className="mt-3 space-y-2"><p>Za ročno povezavo najprej izrecno pripravite podatke tega primera. Običajni predogled zgoraj ta korak opravi sam.</p><PrepareOfferButton serviceRequestId={props.serviceRequestId} compact/></div>:<LinkManualEstimateForm serviceRequestId={props.serviceRequestId}/>}</details></div>;}

