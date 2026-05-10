import { seedWorld } from "./support/seed";

export default async function globalSetup(): Promise<void> {
  const world = await seedWorld();
  // Expose ids to specs via env so tests don't have to query.
  process.env.E2E_ADMIN_ID = world.adminId;
  process.env.E2E_OWNER_ID = world.ownerId;
  process.env.E2E_PLAYER_ID = world.playerId;
  process.env.E2E_VENUE_ID = world.venueId;
  process.env.E2E_COURT_ID = world.courtId;
}
