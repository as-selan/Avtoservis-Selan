import "server-only";
import { quibiWorkflowConfig } from "./workflow-config";
import { createQuibiWorkflowWriteClient, createQuibiDevWriteClient } from "./write-http";

export function configuredQuibiDevWriteClient() {
  return createQuibiDevWriteClient({
    username: process.env.QUIBI_DEV_USERNAME ?? "",
    password: process.env.QUIBI_DEV_PASSWORD ?? "",
  });
}

export function configuredQuibiWorkflowWriteClient() {
 const config=quibiWorkflowConfig(process.env,"write");
 return createQuibiWorkflowWriteClient({username:config.username,password:config.password,origin:config.origin});
}
