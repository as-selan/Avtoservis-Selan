import {assertLocalPartyWriteConfiguration} from './local-write-policy.ts';
import { assertApprovedLocalDevSendConfiguration } from "./local-send-policy.ts";
import { assertQuibiDevTestSendAllowed, quibiDevTestRecipient } from "./write-contract.ts";
export type WorkflowConfig = {
    mode: "dev" | "production";
    origin: string;
    username: string;
    password: string;
};
export function quibiWorkflowConfig(env: Record<string, string | undefined>, capability: "read" | "write" | "send" = "send"): WorkflowConfig {
    if(env.QUIBI_E2E_WRITE_ENABLED==='1'){
        const loopback=(value:string|undefined)=>{try{const u=new URL(value??'');return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!!u.port&&u.origin===value}catch{return false}};
        if(env.APP_ENV!=='local'||env.CI!=='true'||env.SELAN_ISOLATED_E2E!=='1'||env.VERCEL==='1'||env.VERCEL_ENV||env.QUIBI_DEV_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1'||!loopback(env.QUIBI_E2E_ORIGIN)||!loopback(env.NEXT_PUBLIC_SUPABASE_URL)||!loopback(env.PUBLIC_APP_ORIGIN)||env.QUIBI_DEV_USERNAME!=='selan-isolated-fixture'||env.QUIBI_DEV_PASSWORD!=='selan-isolated-fixture'||capability==='send')throw Error('QUIBI_FIXTURE_WRITE_DISABLED');
        return {mode:'dev',origin:env.QUIBI_E2E_ORIGIN!,username:'selan-isolated-fixture',password:'selan-isolated-fixture'};
    }
    const demo = env.SELAN_REMOTE_DEMO === "1" || env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || env.SELAN_LOCAL_REVIEW === "1";
    if (env.APP_ENV === "production" && env.QUIBI_MODE === "production" && env.VERCEL_ENV === "production" && !demo &&
        env.QUIBI_PRODUCTION_READ_ENABLED === "1" && env.QUIBI_PRODUCTION_USERNAME && env.QUIBI_PRODUCTION_PASSWORD &&
        (capability === "read" || env.QUIBI_PRODUCTION_WRITE_ENABLED === "1") &&
        (capability !== "send" || env.QUIBI_PRODUCTION_SEND_ENABLED === "1"))
        return { mode: "production", origin: "https://si.quibi.net", username: env.QUIBI_PRODUCTION_USERNAME, password: env.QUIBI_PRODUCTION_PASSWORD };
    // Status reconciliation is read-only and must survive disabling dispatch.
    if(capability==='read'&&env.APP_ENV==='preproduction'&&env.QUIBI_MODE==='dev'&&!demo&&env.QUIBI_DEV_USERNAME&&env.QUIBI_DEV_PASSWORD)
        return {mode:'dev',origin:'https://dev.quibi.net',username:env.QUIBI_DEV_USERNAME,password:env.QUIBI_DEV_PASSWORD};
    if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'){
        assertLocalPartyWriteConfiguration(env);
        if(capability==='send')throw Error('QUIBI_WORKFLOW_DISABLED');
        return {mode:'dev',origin:'https://dev.quibi.net',username:env.QUIBI_DEV_USERNAME!,password:env.QUIBI_DEV_PASSWORD!};
    }
    if (env.APP_ENV === "preproduction" && env.QUIBI_MODE === "dev" && !demo) {
        try {
            if (env.QUIBI_DEV_LOCAL_SEND_ENABLED === "1") assertApprovedLocalDevSendConfiguration(env, "https://dev.quibi.net", capability !== "read");
            else assertQuibiDevTestSendAllowed(env);
        }
        catch {
            throw Error("QUIBI_WORKFLOW_DISABLED");
        }
        return { mode: "dev", origin: "https://dev.quibi.net", username: env.QUIBI_DEV_USERNAME!, password: env.QUIBI_DEV_PASSWORD! };
    }
    throw Error("QUIBI_WORKFLOW_DISABLED");
}
/** Email equality is part of identity verification, even for synthetic DEV customers. */
function matchingCustomerEmail(local: string | null, remote: string): string {
    const email = local?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.toLowerCase() !== remote.trim().toLowerCase())
        throw Error("QUIBI_CUSTOMER_EMAIL_UNVERIFIED");
    return email;
}
export function actualCustomerEmail(local: string | null, remote: string): string {
    const email = matchingCustomerEmail(local, remote), domain = email.split("@")[1].toLowerCase();
    if (/(^|\.)(test|invalid|localhost|example\.(com|org|net))$/.test(domain) || domain.includes("example.test"))
        throw Error("QUIBI_CUSTOMER_EMAIL_UNVERIFIED");
    return email;
}
export function workflowRecipient(env: Record<string, string | undefined>, local: string | null, remote: string): string {
    const config = quibiWorkflowConfig(env, "send");
    if (config.mode === "production")
        return actualCustomerEmail(local, remote);
    // DEV may identify a synthetic customer, but never transports to that address.
    const customerEmail = matchingCustomerEmail(local, remote);
    const test = quibiDevTestRecipient(env, customerEmail);
    quibiDevTestRecipient(env, remote);
    return test;
}
/** Legacy local/demo fixtures remain DEV; production links require verified production read configuration. */
export function quibiLinkEnvironment(env: Record<string, string | undefined>): "dev" | "production" {
    return env.APP_ENV === "production" || env.QUIBI_MODE === "production" ? quibiWorkflowConfig(env, "read").mode : "dev";
}
