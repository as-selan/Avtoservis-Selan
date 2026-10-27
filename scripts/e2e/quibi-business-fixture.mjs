import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
// Optional extension of the existing loopback fixture. Never contacts another server.
export function createBusinessFixture(customers,send,stateFile){
 const saved=stateFile&&existsSync(stateFile)?JSON.parse(readFileSync(stateFile,"utf8")):null;
 if(saved)customers.splice(0,customers.length,...saved.customers);
 const vehicles=saved?.vehicles??[],documents=saved?.documents??[],requests=new Map(saved?.requests??[]);let nextVehicle=saved?.nextVehicle??5100,nextDocument=saved?.nextDocument??4100;
 const persist=()=>{if(stateFile){writeFileSync(stateFile+".tmp",JSON.stringify({customers,vehicles,documents,requests:[...requests],nextVehicle,nextDocument}));renameSync(stateFile+".tmp",stateFile)}};
 return async(req,res,url)=>{
  const list=(key,inner,values)=>send(res,200,{error:false,data:{[key]:values.map(item=>({[inner]:item}))}});
  const catalogs={'/api2/stevilcenje':['Stevilcenje','Stevilcenje',[{id:'2061',naziv:'Predračun',glava_id:'2'},{id:'6483',naziv:'Delovni nalog',glava_id:'3'},{id:'2060',naziv:'Račun',glava_id:'1'}]],'/api2/enota':['Enote','Enota',[{id:'1',naziv:'kos'}]],'/api2/ddv':['DDV','Ddv',[{id:'1',naziv:'0 %'},{id:'5',naziv:'22 %'}]],'/api2/statusi':['Statusi','Statusi',[{id:'1',naziv:'QA-SIM Osnutek'}]]};
  if(req.method==='GET'&&url.pathname==='/api2/cenik'){send(res,200,{error:false,data:{Cenik:[]}});return true}
  if(req.method==='GET'&&url.pathname==='/api2/sifranti/seznam'){const row={Sifranti:{id:'89158',sifra:'',naziv:'Servis vozila',cenaBrezDDV:'27',enota_id:'1',ddv_id:'5',vodiZalogo:'0'},Enota:{id:'1',naziv:'kos'},Ddv:{id:'5',naziv:'22 %'}};const rows=Number(url.searchParams.get('po')??0)<89158?[row]:[];send(res,200,{error:false,data:{Sifranti:rows},naslednji_po:null});return true}
  if(req.method==='GET'&&url.pathname==='/api2/skladisca'){list('Skladisca','Skladisca',[{id:'1',naziv:'Testno skladišče'}]);return true}
  if(req.method==='GET'&&url.pathname==='/api2/spaces'){list('Spaces','Space',[{id:'1',BusinessPremiseID:'TEST'}]);return true}
  if(req.method==='GET'&&url.pathname==='/api2/glavadokumenta/placila'){list('Placila','Placila',[{naziv:'Bančno nakazilo'}]);return true}
  if(req.method==='GET'&&url.pathname.startsWith('/api2/delnaplacila/placiladokumenta/')){send(res,200,{error:false,data:{Delnaplacila:[]}});return true}
  if(req.method==='GET'&&catalogs[url.pathname]){list(...catalogs[url.pathname]);return true}
  if(req.method==='GET'&&url.pathname==='/api2/glavadokumenta/vrstaprodaje'){send(res,200,{error:false,data:{'1':'Domača prodaja'}});return true}
  if(req.method==='GET'&&url.pathname==='/api2/vozila/index'){list('Vozila','Vozila',vehicles);return true}
  if(req.method==='GET'&&/^\/api2\/vozila\/index\//.test(url.pathname)){list('Vozila','Vozila',vehicles.filter(v=>v.stranka_id===url.pathname.split('/').at(-1)));return true}
  const vehicleId=/^\/api2\/vozila\/view\/(\d+)$/.exec(url.pathname)?.[1];
  if(req.method==='GET'&&vehicleId&&vehicles.some(v=>v.id===vehicleId)){send(res,200,{error:false,data:{Vozilo:{Vozila:vehicles.find(v=>v.id===vehicleId)}}});return true}
  const documentId=/^\/api2\/glavadokumenta\/view\/(\d+)$/.exec(url.pathname)?.[1];
  if(req.method==='GET'&&documentId&&documents.some(d=>d.Glavadokumenta.id===documentId)){send(res,200,{error:false,data:{Dokumenti:[documents.find(d=>d.Glavadokumenta.id===documentId)]}});return true}
  if(req.method!=='POST')return false;
  if(url.pathname.includes('/send')){send(res,403,{error:true,message:'Fixture never sends'});return true}
  const updateId=/^\/api2\/vozila\/form\/(\d+)$/.exec(url.pathname)?.[1];
  if(!updateId&&!['/api2/stranka/form','/api2/vozila/form','/api2/glavadokumenta/form','/api2/dn','/api2/predracuni','/api2/fakture','/api2/glavadokumenta/pdf'].includes(url.pathname))return false;
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>200000){send(res,413,{error:true});return true}}
  let body;try{body=JSON.parse(raw)}catch{send(res,400,{error:true});return true}
  if(url.pathname==='/api2/glavadokumenta/pdf'){
   const document=documents.find(d=>d.Glavadokumenta.id===String(body.Glavadokumenta?.id));
   if(!document||body.Glavadokumenta.natisni!==3||body.Glavadokumenta.jezik!=='sl'){send(res,404,{error:true});return true}
   const text=`QA-SIM document ${document.Glavadokumenta.id} - simulated API, not a real Quibi document`;
   const stream=`BT /F1 12 Tf 40 780 Td (${text}) Tj ET`;
   const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
   let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
   res.writeHead(200,{'content-type':'application/pdf','cache-control':'no-store'});res.end(pdf);return true;
  }
  if(['/api2/dn','/api2/predracuni','/api2/fakture'].includes(url.pathname)){
   const kind={'/api2/dn':'6483','/api2/predracuni':'2061','/api2/fakture':'2060'}[url.pathname];
   send(res,200,{error:false,data:{Dokumenti:documents.filter(d=>String(d.Glavadokumenta.stranka_id)===String(body.Filtriraj?.stranka)&&String(d.Glavadokumenta.stevilcenje_id)===kind)}});return true;
  }
  if(body.Stranka){const c=body.Stranka;if(!/^TEST-SELAN-AI/.test(c.naziv)||!c.remote_id||c.emajl!=='test-selan-ai@example.test'||c.telst&&c.telst!=='+38640111000'){send(res,403,{error:true});return true}let item=customers.find(x=>x.remote_id===c.remote_id);if(!item){item={...c,id:String(2100+customers.length),cenik_id:null,dniZapadlosti:'5'};customers.push(item)}persist();send(res,200,{error:false,data:{Stranke:{Stranka:item}}});return true}
  if(body.Vozila&&updateId){const v=vehicles.find(v=>v.id===updateId);if(!v||!customers.some(c=>c.id===v.stranka_id&&c.naziv==='TEST-SELAN-AI')||!body.Vozila.internastevilka||body.Vozila.internastevilka.length!==17){send(res,403,{error:true});return true}Object.assign(v,body.Vozila);persist();send(res,200,{error:false,data:{Vozila:{Vozilo:v.id}}});return true}
  if(body.Vozila){const v=body.Vozila;if(!customers.some(c=>c.id===String(v.stranka_id)&&c.naziv==='TEST-SELAN-AI')){send(res,403,{error:true});return true}const item={...v,id:String(++nextVehicle),stranka_id:String(v.stranka_id),disabled:0};vehicles.push(item);persist();send(res,200,{error:false,data:{Vozila:{Vozilo:item.id}}});return true}
  if(body.Glavadokumenta){const h=body.Glavadokumenta;if(!customers.some(c=>c.id===String(h.stranka_id)&&c.naziv==='TEST-SELAN-AI')||!vehicles.some(v=>v.id===String(h.vozila_id)&&v.stranka_id===String(h.stranka_id))||!['2061','2060','6483'].includes(String(h.stevilcenje_id))||!h.external_id||h.id){send(res,403,{error:true});return true}
   const existing=requests.get(h.external_id);if(!existing&&documents.some(d=>d.Glavadokumenta.external_id===h.external_id)){send(res,409,{error:true,message:"Existing document requires journal review"});return true}if(existing){if(existing.raw!==raw){send(res,409,{error:true});return true}send(res,200,existing.response);return true}
   const lines=Object.values(body.Postavkedokumenta??{});if(!lines.length||lines.some(l=>l.sifra||l.enota_id!=='1'||!['1','5'].includes(l.ddv_id))){send(res,400,{error:true});return true}
   const viewLines=lines.map(line=>{const rate=line.ddv_id==='5'?22:0,unitNet=Number(line.cenaZDDV),lineNet=Number((unitNet*Number(line.kolicina)*(1-Number(line.popust??0)/100)).toFixed(2));return {...line,cenaBrezDDV:unitNet,cenaZDDV:lineNet,Ddv:{stopnjaDDV:rate,naziv:rate+' %'}}});
   const id=String(++nextDocument),ZapSt=`QA-SIM-${id}`,znesek=viewLines.reduce((sum,line)=>sum+line.cenaZDDV*(1+line.Ddv.stopnjaDDV/100),0).toFixed(2);
   const document={Glavadokumenta:{...h,id,ZapSt,znesek,sklic:'TEST-REFERENCE',uNaziv:'TEST DELAVNICA',sNaziv:'TEST-SELAN-AI',stranka_id:String(h.stranka_id),vozila_id:String(h.vozila_id)},Statusi:{id:'1',naziv:'QA-SIM Osnutek'},Postavkedokumenta:viewLines};documents.push(document);const response={error:false,id,ZapSt};requests.set(h.external_id,{raw,response});persist();send(res,200,response);return true;
  }
  send(res,400,{error:true});return true;
 };
}
