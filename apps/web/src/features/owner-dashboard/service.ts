import "server-only";

// Read-only dashboard queries — no business logic, so service.ts is a thin pass-through.
export {
  getOwnerDashboardStats,
  getTodaysSchedule,
  getCourtUtilizationThisWeek,
  type OwnerDashboardStats,
  type ScheduleItem,
  type CourtUtilization,
} from "./repo";
