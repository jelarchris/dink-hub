import { teardownWorld } from "./support/seed";

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP === "1") return;
  await teardownWorld();
}
