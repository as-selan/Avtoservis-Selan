import "server-only";
import { createQuibiDevWriteClient } from "./write-http";

export function configuredQuibiDevWriteClient() {
  return createQuibiDevWriteClient({
    username: process.env.QUIBI_DEV_USERNAME ?? "",
    password: process.env.QUIBI_DEV_PASSWORD ?? "",
  });
}
