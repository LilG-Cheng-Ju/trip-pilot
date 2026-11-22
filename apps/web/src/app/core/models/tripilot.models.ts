export type TripStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export type ItemType =
  | 'FLIGHT'
  | 'RESERVED_TRANSIT'
  | 'LOCAL_TRANSIT'
  | 'STAY'
  | 'SPOT'
  | 'FOOD';

export type ExpenseCategory =
  | 'FLIGHT'
  | 'LODGING'
  | 'TRANSIT'
  | 'FOOD'
  | 'ACTIVITY'
  | 'SHOPPING'
  | 'OTHER';

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  home_country_code: string;
  home_currency: string;
  created_at: string;
}

export interface ApiTokenItem {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiTokenCreated extends ApiTokenItem {
  plaintext_token: string;
}

export interface RouteSegment {
  id: string;
  from_item_id: string;
  to_item_id: string;
  profile: string;
  distance_km: number;
  duration_min: number | null;
  geometry_polyline: string | null;
  is_approx: boolean;
}

export interface ItineraryItem {
  id: string;
  day_option_id: string;
  type: ItemType;
  sort_order: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  notes: string | null;
  details: Record<string, unknown>;
  choice_group_id: string | null;
  is_selected: boolean;
}

export interface PlaceCandidate {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  provider: string;
}

export interface DayOption {
  id: string;
  trip_day_id: string;
  label: string;
  sort_order: number;
  summary_notes: string | null;
  cached_ground_distance_km: number;
  cached_distance_is_approx: boolean;
  items: ItineraryItem[];
  route_segments: RouteSegment[];
}

export interface TripDay {
  id: string;
  trip_id: string;
  day_index: number;
  date: string;
  title: string | null;
  active_option_id: string | null;
  notes: string | null;
  options: DayOption[];
}

export interface TripSummary {
  id: string;
  title: string;
  destination_summary: string | null;
  country_codes: string[];
  start_date: string;
  end_date: string;
  default_currency: string;
  cover_image_url: string | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface TripDetail extends TripSummary {
  notes: string | null;
  days: TripDay[];
}

export interface ShareVisibilityPolicy {
  include_booking_refs: boolean;
  include_notes: boolean;
  include_expenses: boolean;
  include_backup_options: boolean;
}

export interface TripShare {
  id: string;
  trip_id: string;
  token: string;
  label: string | null;
  visibility_policy: ShareVisibilityPolicy;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PublicTrip {
  title: string;
  destination_summary: string | null;
  country_codes: string[];
  start_date: string;
  end_date: string;
  default_currency: string;
  cover_image_url: string | null;
  notes: string | null;
  visibility_policy: ShareVisibilityPolicy;
  days: TripDay[];
}

export interface ExpenseItem {
  id: string;
  trip_id: string;
  trip_day_id: string | null;
  itinerary_item_id: string | null;
  title: string;
  category: ExpenseCategory;
  amount_original: string;
  currency_original: string;
  exchange_rate: string;
  amount_home: string;
  currency_home: string;
  paid_at: string;
  payment_method: string | null;
  notes: string | null;
}

export interface TripExpensesSummary {
  trip_id: string;
  home_currency: string;
  total_home_amount: string;
  by_category: Record<string, string>;
  items: ExpenseItem[];
}

export interface TravelStats {
  year: number | null;
  home_country_code: string;
  home_currency: string;
  total_trips: number;
  international_trips: number;
  countries_visited: string[];
  total_travel_days: number;
  total_flight_distance_km: number;
  total_ground_distance_km: number;
  total_spend_home: string;
  spend_by_category: Record<string, string>;
}

export interface AirportEntry {
  iata: string;
  name: string;
  city: string;
  country_code: string;
  latitude: number;
  longitude: number;
  timezone: string;
}
