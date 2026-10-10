import { assertApprovedLocalDevSendConfiguration } from "./local-send-policy.ts";
import { assertQuibiDevTestSendAllowed, quibiDevTestRecipient } from "./write-contract.ts";
export type WorkflowConfig = {
    mode: "dev" | "production";
    origin: string;
    username: string;
    password: string;
};
export function quibiWorkflowConfig(env: Record<string, string | undefined>, capability: "read" | "write" | "send" = "send"): WorkflowConfig {
    const demo = env.SELAN_REMOTE_DEMO === "1" || env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || env.SELAN_LOCAL_REVIEW === "1";
    if (env.APP_ENV === "production" && env.QUIBI_MODE === "production" && env.VERCEL_ENV === "production" && !demo &&
        env.QUIBI_PRODUCTION_READ_ENABLED === "1" && env.QUIBI_PRODUCTION_USERNAME && env.QUIBI_PRODUCTION_PASSWORD &&
        (capability === "read" || env.QUIBI_PRODUCTION_WRITE_ENABLED === "1") &&
        (capability !== "send" || env.QUIBI_PRODUCTION_SEND_ENABLED === "1"))
        return { mode: "production", origin: "https://si.quibi.net", username: env.QUIBI_PRODUCTION_USERNAME, password: env.QUIBI_PRODUCTION_PASSWORD };
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
