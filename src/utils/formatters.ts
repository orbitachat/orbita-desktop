export const formatSubscribers = (count: number, lang?: string): string => {
  const c = Math.max(0, count);
  const formattedNum = c.toLocaleString('ru-RU').replace(/\s/g, '\u00a0');
  if (lang && lang.startsWith('en')) {
    return `${formattedNum} subscribers`;
  }
  const mod10 = c % 10;
  const mod100 = c % 100;
  if (mod10 === 1 && mod100 !== 11) return `${formattedNum} подписчик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${formattedNum} подписчика`;
  return `${formattedNum} подписчиков`;
};
