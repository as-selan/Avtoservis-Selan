'use client';
import {useRouter} from 'next/navigation';
import {useTransition} from 'react';
export function QuibiPaymentRefresh(){const router=useRouter();const [pending,start]=useTransition();return <button type="button" disabled={pending} onClick={()=>start(()=>router.refresh())} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{pending?'Preverjam plačilo…':'Preveri plačilo'}</button>;}
