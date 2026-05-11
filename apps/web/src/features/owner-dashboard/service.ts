import "server-only";

// Read-only dashboard queries — no business logic, so service.ts is a thin pass-through.
export {
  getOwnerDashboardStats,
  getUpcomingSchedule,
  getCourtUtilizationThisWeek,
  toManilaDayKey,
  type OwnerDashboardStats,
  type ScheduleItem,
  type CourtUtilization,
} from "./repo";
