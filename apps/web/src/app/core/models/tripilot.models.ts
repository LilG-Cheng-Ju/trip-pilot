export type TripStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type UserRole = 'OWNER' | 'ADMIN' | 'FRIEND' | 'USER';
export type InviteStatus = 'available' | 'used' | 'expired' | 'revoked';

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
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  home_country_code: string;
  home_currency: string;
  created_at: string;
}

export interface AdminUserItem {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  trip_count: number;
  active_token_count: number;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminUserListResponse {
  total: number;
  active_friends_count: number;
  available_invites_count: number;
  items: AdminUserItem[];
}

export interface InviteCodeItem {
  id: string;
  code: string;
  note: string | null;
  is_used: boolean;
  used_by_user_id: string | null;
  used_by_email: string | null;
  used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: InviteStatus;
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

export type StatsScope = 'all' | 'domestic' | 'international';

export interface TripStatSummary {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  days: number;
  country_codes: string[];
  is_international: boolean;
  spend_home: string;
}

export interface FlightRouteStat {
  origin_iata: string;
  dest_iata: string;
  origin_country_code: string;
  dest_country_code: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  count: number;
}

export interface TravelStats {
  year: number | null;
  scope: StatsScope;
  home_country_code: string;
  home_currency: string;
  available_years: number[];
  total_trips: number;
  domestic_trips: number;
  international_trips: number;
  countries_visited: string[];
  country_visit_counts: Record<string, number>;
  total_travel_days: number;
  flight_count: number;
  total_flight_distance_km: number;
  total_ground_distance_km: number;
  total_spend_home: string;
  avg_spend_per_day: string;
  spend_by_category: Record<string, string>;
  trips: TripStatSummary[];
  flight_routes?: FlightRouteStat[];
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

export interface FxRateResponse {
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string;
  cached: boolean;
}

export interface ItemAttachment {
  name: string;
  url: string;
}
