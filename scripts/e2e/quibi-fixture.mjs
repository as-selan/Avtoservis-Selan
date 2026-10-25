import {createBusinessFixture} from './quibi-business-fixture.mjs';
import http from "node:http";

if (process.env.CI !== "true" || process.env.SELAN_ISOLATED_E2E !== "1") {
  throw new Error("Quibi fixture runs only in isolated CI");
}
const port = Number(process.env.SELAN_E2E_FIXTURE_PORT ?? "47862");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid fixture port");
let mode = "normal";
const customers = [
  { id: "2001", naziv: "Bor Preizkus", telst: "+38640333444", emajl: "bor@example.test" },
  { id: "2002", naziv: "Ana Preizkus", telst: "+38640111222", emajl: "ana@example.test" },
];
if(process.env.QUIBI_E2E_WRITE_ENABLED==='1'&&process.env.QUIBI_E2E_CUSTOMER_ID){
 const id=process.env.QUIBI_E2E_CUSTOMER_ID;
 if(!/^\d+$/.test(id)||id==='405956')throw Error('Invalid synthetic fixture customer');
 customers.push({id,naziv:'TEST-SELAN-AI',emajl:'test-selan-ai@example.test',telst:'',remote_id:process.env.QUIBI_E2E_CUSTOMER_REMOTE_ID??''});
}
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const business=process.env.QUIBI_E2E_WRITE_ENABLED==='1'?createBusinessFixture(customers,send,process.env.QUIBI_E2E_STATE_FILE):null;
http.createServer(async(req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__control" && req.method === "POST") {
    const next = url.searchParams.get("mode");
    if (!["normal", "changed", "error"].includes(next)) return send(res, 400, { error: true });
    mode = next;
    return send(res, 200, { ok: true });
  }
  if(business&&await business(req,res,url))return;
  if (mode === "error") return send(res, 503, { error: true });
  if (url.pathname === "/api2/stranka" && req.method === "GET") {
    return send(res, 200, { error: false, data: { Stranke: customers.map((Stranka) => ({ Stranka })) } });
  }
  const match = /^\/api2\/stranka\/view\/(\d+)$/.exec(url.pathname);
  if (match && req.method === "GET") {
    const customer = customers.find((item) => item.id === match[1]);
    if (!customer) return send(res, 404, { error: true });
    return send(res, 200, { error: false, data: { Stranke: { Stranka: {
      ...customer, naziv: mode === "changed" ? `${customer.naziv} spremenjen` : customer.naziv,
    } } } });
  }
  if (/^\/api2\/vozila(?:\/index(?:\/\d+)?)?$/.test(url.pathname) && req.method === "GET") {
    return send(res, 200, { error: false, data: { Vozila: [{ Vozila: {
      id: "5001", stranka_id: "2001", internastevilka: "TST00000000000006",
      registrskastevilka: mode === "changed" ? "LJ QB2" : "LJ QB1",
      proizvajalec: "Test", model: "Quibi", disabled: 0,
    } }] } });
  }
  if (url.pathname === "/api2/vozila/view/5001" && req.method === "GET") {
    return send(res, 200, { error: false, data: { Vozilo: { Vozila: {
      id: "5001", stranka_id: "2001", internastevilka: "TST00000000000006",
      registrskastevilka: mode === "changed" ? "LJ QB2" : "LJ QB1",
      proizvajalec: "Test", model: "Quibi", disabled: 0,
    } } } });
  }
  if (["/api2/dn", "/api2/predracuni"].includes(url.pathname) && req.method === "POST") {
    const id = url.pathname === "/api2/dn" ? "3001" : "4001";
    return send(res, 200, { error: false, data: { Dokumenti: [
      { Glavadokumenta: { id, stranka_id: "2001", stevilcenje_id: "1" } },
      ...(url.pathname === "/api2/dn"?[{Glavadokumenta:{id:"3002",stranka_id:"2001",stevilcenje_id:"1"}}]:[]),
    ] } });
  }
  const workOrder=/^\/api2\/glavadokumenta\/view\/(3001|3002)$/.exec(url.pathname);
  if(workOrder&&req.method==='GET')return send(res,200,{error:false,data:{Dokumenti:[{
    Glavadokumenta:{id:workOrder[1],stranka_id:'2001',vozila_id:'5001',stevilcenje_id:'1',ZapSt:'QA-'+workOrder[1],znesek:'122.00'},
    Postavkedokumenta:[{opis:'Servis QA',kolicina:'1',cenaBrezDDV:'100',cenaZDDV:'100',popust:'0',enota_id:'1',ddv_id:'5',Ddv:{stopnjaDDV:'22',naziv:'22 %'}}]
  }]}});
  if (url.pathname === "/api2/glavadokumenta/view/4001" && req.method === "GET") {
    return send(res, 200, { error: false, data: { Dokumenti: [{
      Glavadokumenta: { id: "4001", stranka_id: "2001", znesek: "125.50" },
      Statusi: { id: "1", naziv: "Osnutek" },
      Postavkedokumenta: [{ opis: "Preizkusna storitev", kolicina: "1", cenaZDDV: "125.50" }],
    }] } });
  }
  return send(res, 404, { error: true });
}).listen(port, "127.0.0.1", () => console.log("Isolated Quibi read fixture ready on loopback."));
