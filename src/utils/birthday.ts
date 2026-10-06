export const MONTH_NAMES_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export const MONTH_SHORT_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export const MONTH_SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const MONTH_FULL_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const MONTH_FULL_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface ParsedBirthday {
  day: number;
  month: number;
  year: number | null;
}

export function parseBirthday(val: string | null | undefined): ParsedBirthday | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return {
      day: d,
      month: m,
      year: y > 1900 ? y : null,
    };
  }

  const md = trimmed.match(/^(?:--)?(\d{1,2})-(\d{1,2})$/);
  if (md) {
    const m = parseInt(md[1], 10);
    const d = parseInt(md[2], 10);
    return {
      day: d,
      month: m,
      year: null,
    };
  }

  const dmy = trimmed.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = dmy[3] ? parseInt(dmy[3], 10) : null;
    return {
      day: d,
      month: m,
      year: y && y > 1900 ? y : null,
    };
  }

  return null;
}

export function formatBirthday(val: string | null | undefined, language: string = 'ru'): string {
  const parsed = parseBirthday(val);
  if (!parsed) return '';

  const { day, month, year } = parsed;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const isRu = language === 'ru' || language === 'uk' || language === 'be';
  const monthStr = isRu ? MONTH_SHORT_RU[month - 1] : MONTH_SHORT_EN[month - 1];

  if (year) {
    return `${day} ${monthStr} ${year}`;
  }
  return `${day} ${monthStr}`;
}

export function serializeBirthday(day: number, month: number, year: number | null): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  if (year && year > 1900) {
    return `${year}-${mm}-${dd}`;
  }
  return `--${mm}-${dd}`;
}
