import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { getApiBaseUrl } from '../config/runtime-config';
import {
  AirportEntry,
  ApiTokenCreated,
  ApiTokenItem,
  DayOption,
  ExpenseCategory,
  ExpenseItem,
  ItemType,
  ItineraryItem,
  PlaceCandidate,
  PublicTrip,
  ShareVisibilityPolicy,
  TravelStats,
  TripDay,
  TripDetail,
  TripExpensesSummary,
  TripShare,
  TripStatus,
  TripSummary,
  UserProfile,
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
  payment_method?: string | null;
  notes?: string | null;
}

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

  updateTrip(
    tripId: string,
    payload: Partial<Pick<TripDetail, 'title' | 'destination_summary' | 'country_codes' | 'default_currency' | 'status' | 'notes'>>,
  ): Promise<TripDetail> {
    return firstValueFrom(
      this.http.patch<TripDetail>(`${this.baseUrl}/trips/${tripId}`, payload),
    );
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

  deleteExpense(expenseId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/expenses/${expenseId}`),
    );
  }

  getStats(year?: number | null): Promise<TravelStats> {
    let params = new HttpParams();
    if (year) {
      params = params.set('year', String(year));
    }
    return firstValueFrom(this.http.get<TravelStats>(`${this.baseUrl}/stats`, { params }));
  }

  searchAirports(query: string): Promise<AirportEntry[]> {
    const params = new HttpParams().set('q', query);
    return firstValueFrom(
      this.http.get<AirportEntry[]>(`${this.baseUrl}/airports/search`, { params }),
    );
  }
}
