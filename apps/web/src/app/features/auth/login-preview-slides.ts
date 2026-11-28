import { SupportedLocale } from '../../core/i18n/i18n.service';

export interface LoginPreviewSlide {
  readonly code: string;
  readonly flightNo: string;
  readonly bookingRef: string;
  readonly originIata: string;
  readonly originTime: string;
  readonly destIata: string;
  readonly destTime: string;
  readonly distanceKm: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  readonly pinOrder: number;
  readonly pinColor: string;
  readonly timeRange: string;
  readonly localName: string;
  readonly copy: Record<
    SupportedLocale,
    {
      readonly dayTheme: string;
      readonly planA: string;
      readonly planB: string;
      readonly spotTitle: string;
      readonly alt1: string;
      readonly alt2: string;
    }
  >;
}

/** Curated bilingual product preview slides showcasing multi-country Tripilot workflows. */
export const LOGIN_PREVIEW_SLIDES: readonly LoginPreviewSlide[] = [
  {
    code: 'JP',
    flightNo: 'JX820',
    bookingRef: 'REF JX9K4M',
    originIata: 'TPE',
    originTime: '08:30',
    destIata: 'KIX',
    destTime: '12:05',
    distanceKm: '1,703 km',
    dayLabel: 'Day 01',
    dateLabel: '11-29',
    pinOrder: 2,
    pinColor: 'var(--item-spot)',
    timeRange: '17:30 – 19:30',
    localName: '音羽山 清水寺',
    copy: {
      'zh-TW': {
        dayTheme: '京都秋楓・抵達日',
        planA: 'Plan A',
        planB: 'Plan B · 雨備',
        spotTitle: '清水寺 秋季夜間參拜',
        alt1: '麵屋豬一 離れ',
        alt2: '三嶋亭 本店',
      },
      en: {
        dayTheme: 'Kyoto Autumn · Arrival',
        planA: 'Plan A',
        planB: 'Plan B · Rain',
        spotTitle: 'Kiyomizu-dera Temple',
        alt1: 'Menya Inoichi',
        alt2: 'Mishimatei',
      },
    },
  },
  {
    code: 'CZ',
    flightNo: 'CI067',
    bookingRef: 'REF PRG882',
    originIata: 'TPE',
    originTime: '23:10',
    destIata: 'PRG',
    destTime: '07:10',
    distanceKm: '9,057 km',
    dayLabel: 'Day 02',
    dateLabel: '05-16',
    pinOrder: 1,
    pinColor: 'var(--item-spot)',
    timeRange: '07:30 – 09:00',
    localName: 'Karlův most',
    copy: {
      'zh-TW': {
        dayTheme: '布拉格舊城・維也納',
        planA: 'Plan A',
        planB: 'Plan B · 美術館',
        spotTitle: '查理大橋日出散步',
        alt1: 'Café Louvre',
        alt2: 'Lokál Dlouhááá',
      },
      en: {
        dayTheme: 'Prague Old Town & Vienna',
        planA: 'Plan A',
        planB: 'Plan B · Museums',
        spotTitle: 'Charles Bridge Sunrise Walk',
        alt1: 'Café Louvre',
        alt2: 'Lokál Dlouhááá',
      },
    },
  },
  {
    code: 'KR',
    flightNo: 'BR160',
    bookingRef: 'REF PUS204',
    originIata: 'TPE',
    originTime: '15:15',
    destIata: 'PUS',
    destTime: '18:45',
    distanceKm: '1,342 km',
    dayLabel: 'Day 02',
    dateLabel: '12-11',
    pinOrder: 3,
    pinColor: 'var(--item-food)',
    timeRange: '16:00 – 17:30',
    localName: '해운대 블루라인파크',
    copy: {
      'zh-TW': {
        dayTheme: '釜山海雲台與廣安里',
        planA: 'Plan A',
        planB: 'Plan B · 咖啡廳',
        spotTitle: '海雲台膠囊列車',
        alt1: '密陽豬肉湯飯',
        alt2: '尾浦家醬蟹',
      },
      en: {
        dayTheme: 'Busan Coast & Gwangalli',
        planA: 'Plan A',
        planB: 'Plan B · Cafés',
        spotTitle: 'Haeundae Sky Capsule',
        alt1: 'Miryang Pork Soup',
        alt2: 'Mipo-jib',
      },
    },
  },
  {
    code: 'IS',
    flightNo: 'FI529',
    bookingRef: 'REF KEF412',
    originIata: 'FRA',
    originTime: '14:00',
    destIata: 'KEF',
    destTime: '16:40',
    distanceKm: '2,394 km',
    dayLabel: 'Day 03',
    dateLabel: '02-18',
    pinOrder: 2,
    pinColor: 'var(--item-spot)',
    timeRange: '19:30 – 22:00',
    localName: 'Hallgrímskirkja',
    copy: {
      'zh-TW': {
        dayTheme: '雷克雅維克・追極光之夜',
        planA: 'Plan A',
        planB: 'Plan B · 暴雪改藍湖',
        spotTitle: '哈爾格林姆教堂與彩虹街',
        alt1: 'Bæjarins Beztu 熱狗',
        alt2: 'Brauð & Co. 肉桂捲',
      },
      en: {
        dayTheme: 'Reykjavík & Aurora Watch',
        planA: 'Plan A',
        planB: 'Plan B · Blue Lagoon',
        spotTitle: 'Hallgrímskirkja & Rainbow St.',
        alt1: 'Bæjarins Beztu',
        alt2: 'Brauð & Co.',
      },
    },
  },
  {
    code: 'CH',
    flightNo: 'LX139',
    bookingRef: 'REF ZRH709',
    originIata: 'HKG',
    originTime: '23:35',
    destIata: 'ZRH',
    destTime: '06:15',
    distanceKm: '9,282 km',
    dayLabel: 'Day 04',
    dateLabel: '07-12',
    pinOrder: 1,
    pinColor: 'var(--item-spot)',
    timeRange: '09:30 – 14:30',
    localName: 'Grindelwald First',
    copy: {
      'zh-TW': {
        dayTheme: '少女峰區・阿爾卑斯健行',
        planA: 'Plan A',
        planB: 'Plan B · 圖恩湖遊船',
        spotTitle: '格林德瓦 First 天空步道',
        alt1: 'Bachalpsee 高山湖',
        alt2: '勞特布魯嫩瀑布鎮',
      },
      en: {
        dayTheme: 'Jungfrau Alpine Ridge',
        planA: 'Plan A',
        planB: 'Plan B · Lake Thun',
        spotTitle: 'Grindelwald First Cliff Walk',
        alt1: 'Lake Bachalpsee',
        alt2: 'Lauterbrunnen Valley',
      },
    },
  },
  {
    code: 'FR',
    flightNo: 'BR087',
    bookingRef: 'REF CDG531',
    originIata: 'TPE',
    originTime: '23:30',
    destIata: 'CDG',
    destTime: '07:35',
    distanceKm: '9,814 km',
    dayLabel: 'Day 02',
    dateLabel: '09-22',
    pinOrder: 2,
    pinColor: 'var(--item-spot)',
    timeRange: '14:00 – 17:00',
    localName: 'Musée d’Orsay',
    copy: {
      'zh-TW': {
        dayTheme: '巴黎左岸與瑪黑區散步',
        planA: 'Plan A',
        planB: 'Plan B · 室內美術日',
        spotTitle: '奧賽美術館與塞納河岸',
        alt1: 'Café de Flore',
        alt2: 'L’As du Fallafel',
      },
      en: {
        dayTheme: 'Paris Left Bank & Marais',
        planA: 'Plan A',
        planB: 'Plan B · Indoor Art',
        spotTitle: 'Musée d’Orsay & Seine Walk',
        alt1: 'Café de Flore',
        alt2: 'L’As du Fallafel',
      },
    },
  },
];

/** Returns a fresh Fisher-Yates shuffled copy so each login visit opens on a different destination. */
export function shufflePreviewSlides(
  slides: readonly LoginPreviewSlide[],
  rng: () => number = Math.random,
): LoginPreviewSlide[] {
  const result = [...slides];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
