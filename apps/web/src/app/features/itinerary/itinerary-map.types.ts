export interface MapPin {
  id: string;
  order: number;
  title: string;
  lat: number;
  lng: number;
  type?: string;
}

export interface StayMapPin {
  id: string;
  title: string;
  lat: number;
  lng: number;
}
