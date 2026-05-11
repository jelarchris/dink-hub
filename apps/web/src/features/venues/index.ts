export {
  findActiveVenueBySlug,
  getCourtOccupancy,
  getCourtsOccupancy,
  getMarketplaceStats,
  getVenueAvailabilityMap,
  listActiveVenueCities,
  listActiveVenues,
  type CityOption,
  type ListActiveVenuesOptions,
  type MarketplaceStats,
  type VenueAvailability,
  type VenueListItem,
  type VenueSort,
} from "./repo";

// Re-export shared availability types so RSC pages can import from the barrel.
// Client components must import directly from "@/features/venues/availability"
// (NOT from this barrel) to avoid pulling in server-only repo code.
export type { AvailabilityFilter, TimeOfDay } from "./availability";
