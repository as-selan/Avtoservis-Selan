'use client';
import {useRef,useState,useTransition} from 'react';import {useRouter} from 'next/navigation';import {assignWorkOrder} from '@/lib/work-orders/actions';
export function WorkOrderAssignment({id,current,mechanics}:{id:string;current:string|null;mechanics:{id:string;name:string}[]}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),router=useRouter(),lock=useRef(false),command=useRef<string|null>(null);
 return <form className="space-y-3 rounded border bg-white p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;command.current??=crypto.randomUUID();const form=new FormData(e.currentTarget);form.set('orderId',id);form.set('commandId',command.current);start(async()=>{try{const r=await assignWorkOrder(form);if(r.ok){command.current=null;setMessage('Dodelitev je shranjena.');router.refresh()}else setMessage(r.message)}catch{setMessage('Izid dodelitve ni potrjen. Pred ponovitvijo osvežite nalog.')}finally{lock.current=false}})}}>
 <h2 className="font-semibold">Dodelitev mehaniku</h2><label className="block">Aktivni mehanik<select name="mechanicId" defaultValue={current??''} className="mt-1 block w-full rounded border p-2"><option value="">Nedodeljen nalog</option>{mechanics.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{pending?'Shranjujem dodelitev…':'Shrani dodelitev'}</button>{message&&<p role="status">{message}</p>}
 </form>;
}
