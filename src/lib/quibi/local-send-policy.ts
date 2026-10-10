type Environment = Record<string, string | undefined>;
/** Explicit, narrowly scoped permission. It never applies to a hosted deployment. */
export function assertApprovedLocalDevSendConfiguration(env: Environment, origin = "https://dev.quibi.net", requireWrite = true): void {
    let app: URL;
    try { app = new URL(env.PUBLIC_APP_ORIGIN ?? ""); } catch { throw Error("QUIBI_LOCAL_SEND_DISABLED"); }
    if (origin !== "https://dev.quibi.net" || env.APP_ENV !== "preproduction" || env.QUIBI_MODE !== "dev" ||
        env.QUIBI_DEV_LOCAL_SEND_ENABLED !== "1" || env.SELAN_APPROVED_LOCAL_DEV !== "1" || (requireWrite && env.QUIBI_DEV_WRITE_ENABLED !== "1") ||
        (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "development") || env.VERCEL === "1" ||
        env.SELAN_REMOTE_DEMO === "1" || env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || env.SELAN_LOCAL_REVIEW === "1" || env.QUIBI_E2E_ORIGIN ||
        !env.QUIBI_DEV_USERNAME || !env.QUIBI_DEV_PASSWORD || env.QUIBI_DEV_TEST_RECIPIENT !== "online.gold100@gmail.com" ||
        app.protocol !== "http:" || app.hostname !== "127.0.0.1" || app.origin !== env.PUBLIC_APP_ORIGIN || app.username || app.password ||
        env.COMPLETION_PUBLIC_ORIGIN !== app.origin)
        throw Error("QUIBI_LOCAL_SEND_DISABLED");
}
export function assertLocalQuibiRequest(env: Environment, requestHeaders: Pick<Headers, "get">, sending = false): void {
    if (env.QUIBI_DEV_LOCAL_SEND_ENABLED !== "1") return;
    // Request origin checks also protect read-only actions and login; dispatch checks its write capability separately.
    assertApprovedLocalDevSendConfiguration(env, "https://dev.quibi.net", false);
    const app = new URL(env.PUBLIC_APP_ORIGIN!);
    const forwardedHost = requestHeaders.get("x-forwarded-host"), forwardedFor = requestHeaders.get("x-forwarded-for"), forwardedProto = requestHeaders.get("x-forwarded-proto");
    const requestOrigin = requestHeaders.get("origin");
    if (requestHeaders.get("host") !== app.host || (sending && requestOrigin !== app.origin) ||
        (requestOrigin !== null && requestOrigin !== app.origin) || (forwardedHost !== null && forwardedHost !== app.host) ||
        (forwardedFor !== null && forwardedFor !== "127.0.0.1") || (forwardedProto !== null && forwardedProto !== "http"))
        throw Error("QUIBI_LOCAL_REQUEST_FORBIDDEN");
}
export function assertLocalQuibiSendTarget(env: Environment, s: {caseId: string;quoteId: string;customerId: string;vehicleId: string;documentId: string;reviewStatus: string;detail: {amount: string}}): void {
    if (env.QUIBI_DEV_LOCAL_SEND_ENABLED !== "1") return;
    assertApprovedLocalDevSendConfiguration(env);
    if (s.caseId !== "9d40c42f-b6a8-473b-983f-f9620df97d10" || s.quoteId !== "ab9f75b2-e6f3-45c7-82de-e36c82faab7b" ||
        s.customerId !== "405956" || s.vehicleId !== "2387" || s.documentId !== "2176888" ||
        s.reviewStatus !== "approved_for_send" || Number(s.detail.amount) !== 122)
        throw Error("QUIBI_LOCAL_SEND_SCOPE_MISMATCH");
}

export function localQaIdentityExceptionAvailable(env: Environment, caseId: string, quoteId: string, documentId: string, amount: string): boolean {
 try { assertApprovedLocalDevSendConfiguration(env); } catch { return false; }
 return caseId === "9d40c42f-b6a8-473b-983f-f9620df97d10" && quoteId === "ab9f75b2-e6f3-45c7-82de-e36c82faab7b" && documentId === "2176888" && Number(amount) === 122;
}
