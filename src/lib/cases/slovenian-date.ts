/** ISO date-only values: no local/UTC conversion or locale-dependent parsing. */
export function slovenianDate(iso:string){const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}. ${m[2]}. ${m[1]}`:'';}
export function isoFromSlovenianDate(text:string){
 const m=text.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);if(!m)return null;
 const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 const date=new Date(iso+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
