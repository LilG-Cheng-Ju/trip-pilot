import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { getApiBaseUrl } from '../config/runtime-config';
import {
  AdminUserItem,
  AdminUserListResponse,
  AirportEntry,
  ApiTokenCreated,
  ApiTokenItem,
  DayOption,
  ExpenseCategory,
  ExpenseItem,
  FxRateResponse,
  InviteCodeItem,
  ItemType,
  ItineraryItem,
  PlaceCandidate,
  PublicTrip,
  ShareVisibilityPolicy,
  StatsScope,
  TravelStats,
  TripDay,
  TripDetail,
  TripExpensesSummary,
  TripShare,
  TripStatus,
  TripSummary,
  UserProfile,
  UserRole,
} from '../models/tripilot.models';

export interface CreateTripPayload {
  title: string;
  destination_summary?: string | null;
  country_codes: string[];
  start_date: string;
  end_date: string;
  default_currency: string;
  status?: TripStatus;
  notes?: string | null;
}

export interface TripUpdatePayload {
  title?: string;
  destination_summary?: string | null;
  country_codes?: string[];
  start_date?: string;
  default_currency?: string;
  status?: TripStatus;
  notes?: string | null;
}

export interface CreateItemPayload {
  type: ItemType;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_maps_url?: string | null;
  notes?: string | null;
  details?: Record<string, unknown>;
  alternative_for_item_id?: string | null;
}

export interface CreateExpensePayload {
  trip_day_id?: string | null;
  itinerary_item_id?: string | null;
  title: string;
  category: ExpenseCategory;
  amount_original: number;
  currency_original: string;
  exchange_rate: number;
  paid_at?: string | null;
  payment_method?: string | null;
  notes?: string | null;
}

export type UpdateExpensePayload = Partial<CreateExpensePayload>;

/** Typed HTTP client for all Tripilot v1 REST endpoints. */
@Injectable({ providedIn: 'root' })
export class TripilotApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${getApiBaseUrl()}/api/v1`;

  getMe(): Promise<UserProfile> {
    return firstValueFrom(this.http.get<UserProfile>(`${this.baseUrl}/me`));
  }

  updateMe(payload: Partial<Pick<UserProfile, 'display_name' | 'home_country_code' | 'home_currency'>>): Promise<UserProfile> {
    return firstValueFrom(this.http.patch<UserProfile>(`${this.baseUrl}/me`, payload));
  }

  listTokens(): Promise<ApiTokenItem[]> {
    return firstValueFrom(this.http.get<ApiTokenItem[]>(`${this.baseUrl}/tokens`));
  }

  createToken(name: string, scopes?: string[]): Promise<ApiTokenCreated> {
    return firstValueFrom(
      this.http.post<ApiTokenCreated>(`${this.baseUrl}/tokens`, {
        name,
        ...(scopes ? { scopes } : {}),
      }),
    );
  }

  revokeToken(tokenId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/tokens/${tokenId}`));
  }

  listTrips(status?: TripStatus): Promise<TripSummary[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return firstValueFrom(
      this.http.get<TripSummary[]>(`${this.baseUrl}/trips`, { params }),
    );
  }

  createTrip(payload: CreateTripPayload): Promise<TripDetail> {
    return firstValueFrom(this.http.post<TripDetail>(`${this.baseUrl}/trips`, payload));
  }

  getTrip(tripId: string): Promise<TripDetail> {
    return firstValueFrom(this.http.get<TripDetail>(`${this.baseUrl}/trips/${tripId}`));
  }

  updateTrip(tripId: string, payload: TripUpdatePayload): Promise<TripDetail> {
    return firstValueFrom(
      this.http.patch<TripDetail>(`${this.baseUrl}/trips/${tripId}`, payload),
    );
  }

  deleteTrip(tripId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/trips/${tripId}`));
  }

  addDayOption(dayId: string, label: string, summary_notes?: string): Promise<DayOption> {
    return firstValueFrom(
      this.http.post<DayOption>(`${this.baseUrl}/days/${dayId}/options`, {
        label,
        summary_notes,
      }),
    );
  }

  appendDay(tripId: string): Promise<TripDay> {
    return firstValueFrom(
      this.http.post<TripDay>(`${this.baseUrl}/trips/${tripId}/days`, {}),
    );
  }

  updateDay(dayId: string, payload: { title?: string | null; notes?: string | null }): Promise<TripDay> {
    return firstValueFrom(
      this.http.patch<TripDay>(`${this.baseUrl}/days/${dayId}`, payload),
    );
  }

  deleteDay(dayId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/days/${dayId}`));
  }

  selectChoiceItem(itemId: string): Promise<DayOption> {
    return firstValueFrom(
      this.http.patch<DayOption>(`${this.baseUrl}/items/${itemId}/select`, {}),
    );
  }

  searchPlaces(query: string, lang = 'zh-TW'): Promise<PlaceCandidate[]> {
    const params = new HttpParams().set('q', query).set('lang', lang);
    return firstValueFrom(
      this.http.get<PlaceCandidate[]>(`${this.baseUrl}/places/search`, { params }),
    );
  }

  resolvePlaceUrl(url: string): Promise<PlaceCandidate> {
    return firstValueFrom(
      this.http.post<PlaceCandidate>(`${this.baseUrl}/places/resolve-url`, { url }),
    );
  }

  cloneDayOption(optionId: string, label: string): Promise<DayOption> {
    return firstValueFrom(
      this.http.post<DayOption>(`${this.baseUrl}/options/${optionId}/clone`, { label }),
    );
  }

  updateDayOption(optionId: string, label: string): Promise<DayOption> {
    return firstValueFrom(
      this.http.patch<DayOption>(`${this.baseUrl}/options/${optionId}`, { label }),
    );
  }

  deleteDayOption(optionId: string): Promise<TripDay> {
    return firstValueFrom(
      this.http.delete<TripDay>(`${this.baseUrl}/options/${optionId}`),
    );
  }

  setActiveOption(dayId: string, dayOptionId: string): Promise<TripDay> {
    return firstValueFrom(
      this.http.patch<TripDay>(`${this.baseUrl}/days/${dayId}/active-option`, {
        day_option_id: dayOptionId,
      }),
    );
  }

  addItem(optionId: string, payload: CreateItemPayload): Promise<ItineraryItem> {
    return firstValueFrom(
      this.http.post<ItineraryItem>(`${this.baseUrl}/options/${optionId}/items`, payload),
    );
  }

  updateItem(itemId: string, payload: Partial<CreateItemPayload>): Promise<ItineraryItem> {
    return firstValueFrom(
      this.http.patch<ItineraryItem>(`${this.baseUrl}/items/${itemId}`, payload),
    );
  }

  moveItem(
    itemId: string,
    targetOptionId: string,
    sortOrder?: number,
  ): Promise<ItineraryItem> {
    return firstValueFrom(
      this.http.patch<ItineraryItem>(`${this.baseUrl}/items/${itemId}/move`, {
        target_option_id: targetOptionId,
        ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
      }),
    );
  }

  deleteItem(itemId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/items/${itemId}`));
  }

  reorderItems(optionId: string, itemIds: string[]): Promise<DayOption> {
    return firstValueFrom(
      this.http.post<DayOption>(`${this.baseUrl}/options/${optionId}/items/reorder`, {
        item_ids: itemIds,
      }),
    );
  }

  recalculateOptionRoute(optionId: string): Promise<DayOption> {
    return firstValueFrom(
      this.http.post<DayOption>(`${this.baseUrl}/options/${optionId}/recalculate-route`, {}),
    );
  }

  listShares(tripId: string): Promise<TripShare[]> {
    return firstValueFrom(
      this.http.get<TripShare[]>(`${this.baseUrl}/trips/${tripId}/shares`),
    );
  }

  createShare(
    tripId: string,
    label: string,
    visibility_policy: ShareVisibilityPolicy,
  ): Promise<TripShare> {
    return firstValueFrom(
      this.http.post<TripShare>(`${this.baseUrl}/trips/${tripId}/shares`, {
        label,
        visibility_policy,
      }),
    );
  }

  revokeShare(tripId: string, shareId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/trips/${tripId}/shares/${shareId}`),
    );
  }

  getPublicTrip(shareToken: string): Promise<PublicTrip> {
    return firstValueFrom(
      this.http.get<PublicTrip>(`${this.baseUrl}/public/trips/${shareToken}`),
    );
  }

  listExpenses(tripId: string): Promise<TripExpensesSummary> {
    return firstValueFrom(
      this.http.get<TripExpensesSummary>(`${this.baseUrl}/trips/${tripId}/expenses`),
    );
  }

  createExpense(tripId: string, payload: CreateExpensePayload): Promise<ExpenseItem> {
    return firstValueFrom(
      this.http.post<ExpenseItem>(`${this.baseUrl}/trips/${tripId}/expenses`, payload),
    );
  }

  updateExpense(expenseId: string, payload: UpdateExpensePayload): Promise<ExpenseItem> {
    return firstValueFrom(
      this.http.patch<ExpenseItem>(`${this.baseUrl}/expenses/${expenseId}`, payload),
    );
  }

  deleteExpense(expenseId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/expenses/${expenseId}`),
    );
  }

  getExchangeRate(from: string, to: string): Promise<FxRateResponse> {
    const params = new HttpParams()
      .set('from', from.trim().toUpperCase())
      .set('to', to.trim().toUpperCase());
    return firstValueFrom(
      this.http.get<FxRateResponse>(`${this.baseUrl}/fx/rate`, { params }),
    );
  }

  resolveLinkTitle(url: string): Promise<{ title: string | null }> {
    return firstValueFrom(
      this.http.post<{ title: string | null }>(`${this.baseUrl}/links/resolve-title`, { url }),
    );
  }

  getStats(year?: number | null, scope: StatsScope = 'all'): Promise<TravelStats> {
    let params = new HttpParams().set('scope', scope);
    if (year) {
      params = params.set('year', String(year));
    }
    return firstValueFrom(this.http.get<TravelStats>(`${this.baseUrl}/stats`, { params }));
  }

  searchAirports(query: string, limit = 10): Promise<AirportEntry[]> {
    const params = new HttpParams().set('q', query).set('limit', String(limit));
    return firstValueFrom(
      this.http.get<AirportEntry[]>(`${this.baseUrl}/airports/search`, { params }),
    );
  }

  redeemInviteCode(code: string): Promise<UserProfile> {
    return firstValueFrom(
      this.http.post<UserProfile>(`${this.baseUrl}/invites/redeem`, { code }),
    );
  }

  listAdminUsers(options?: {
    q?: string;
    role?: UserRole | '';
    sort_by?: 'created_at' | 'last_login_at' | 'role';
    order?: 'asc' | 'desc';
  }): Promise<AdminUserListResponse> {
    let params = new HttpParams();
    if (options?.q?.trim()) {
      params = params.set('q', options.q.trim());
    }
    if (options?.role) {
      params = params.set('role', options.role);
    }
    if (options?.sort_by) {
      params = params.set('sort_by', options.sort_by);
    }
    if (options?.order) {
      params = params.set('order', options.order);
    }
    return firstValueFrom(
      this.http.get<AdminUserListResponse>(`${this.baseUrl}/admin/users`, { params }),
    );
  }

  updateAdminUser(
    userId: string,
    payload: { role?: UserRole; is_active?: boolean },
  ): Promise<AdminUserItem> {
    return firstValueFrom(
      this.http.patch<AdminUserItem>(`${this.baseUrl}/admin/users/${userId}`, payload),
    );
  }

  revokeAdminUserTokens(userId: string): Promise<{ revoked_count: number }> {
    return firstValueFrom(
      this.http.post<{ revoked_count: number }>(
        `${this.baseUrl}/admin/users/${userId}/revoke-tokens`,
        {},
      ),
    );
  }

  deleteAdminUser(userId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/admin/users/${userId}`),
    );
  }

  listAdminInvites(): Promise<InviteCodeItem[]> {
    return firstValueFrom(
      this.http.get<InviteCodeItem[]>(`${this.baseUrl}/admin/invites`),
    );
  }

  createAdminInvites(payload: {
    count: number;
    note?: string | null;
    expires_in_days?: number | null;
  }): Promise<InviteCodeItem[]> {
    return firstValueFrom(
      this.http.post<InviteCodeItem[]>(`${this.baseUrl}/admin/invites`, payload),
    );
  }

  revokeAdminInvite(inviteId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/admin/invites/${inviteId}`),
    );
  }
}
