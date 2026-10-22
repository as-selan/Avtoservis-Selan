import {QuibiDevWritePanel} from './QuibiDevWritePanel';
import {LinkManualEstimateForm} from './LinkManualEstimateForm';
import type {EstimateComposerProps} from './EstimateComposer';
/** One ordinary editor; manual document identity verification is an optional separate path. */
export function EstimatePreparationWorkspace(props:EstimateComposerProps){return <div className="space-y-4" data-estimate-workspace><QuibiDevWritePanel {...props}/><details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Napredno – poveži obstoječ predračun</summary><LinkManualEstimateForm serviceRequestId={props.serviceRequestId}/></details></div>;}
