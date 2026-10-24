import {PrepareOfferButton} from './PrepareOfferButton';
import {QuibiDevWritePanel} from './QuibiDevWritePanel';
import {LinkManualEstimateForm} from './LinkManualEstimateForm';
import type {EstimateComposerProps} from './EstimateComposer';
/** One ordinary editor; manual document identity verification is an optional separate path. */
export function EstimatePreparationWorkspace(props:EstimateComposerProps){return <div className="space-y-4" data-estimate-workspace><QuibiDevWritePanel {...props}/><details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Napredno – poveži obstoječ predračun</summary>{props.offerPrepared===false?<div className="mt-3 space-y-2"><p>Za ročno povezavo najprej izrecno pripravite podatke tega primera. Običajni predogled zgoraj ta korak opravi sam.</p><PrepareOfferButton serviceRequestId={props.serviceRequestId} compact/></div>:<LinkManualEstimateForm serviceRequestId={props.serviceRequestId}/>}</details></div>;}
