import { seedWorld } from "./support/seed";
import { signInAndPersist } from "./support/auth";

export default async function globalSetup(): Promise<void> {
  const world = await seedWorld();
  // Expose ids to specs via env so tests don't have to query.
  process.env.E2E_ADMIN_ID = world.adminId;
  process.env.E2E_OWNER_ID = world.ownerId;
  process.env.E2E_PLAYER_ID = world.playerId;
  process.env.E2E_VENUE_ID = world.venueId;
  process.env.E2E_COURT_ID = world.courtId;

  // When the test-signin route is unlocked, pre-authenticate every persona
  // once and stash a storageState per role. Specs that use these declare
  // `test.use({ storageState: STORAGE_STATE.player })`.
  if (process.env.E2E_TEST_TOKEN) {
    const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}`;
    await signInAndPersist("admin", baseURL);
    await signInAndPersist("owner", baseURL);
    await signInAndPersist("player", baseURL);
  }
}
