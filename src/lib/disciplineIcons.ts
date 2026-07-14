// Emoji icons for sport disciplines. Para variants share the base sport's icon.

const DISCIPLINE_ICONS: Record<string, string> = {
  'Archery': '🏹',
  'Athletics': '🏃',
  'Badminton': '🏸',
  'Basketball': '🏀',
  'Boxing': '🥊',
  'Cycling': '🚴',
  'Fencing': '🤺',
  'Football': '⚽',
  'Gymnastics': '🤸',
  'Handball': '🤾',
  'Hockey': '🏑',
  'Ice Hockey': '🏒',
  'Indigenous Wrestling': '🤼',
  'Judo': '🥋',
  'Kabaddi': '🤼',
  'Karate': '🥋',
  'Kayaking & Canoeing': '🛶',
  'Kho Kho': '🏃',
  'Korfball': '🏀',
  'Lawn Tennis': '🎾',
  'Mallakhamb': '🤸',
  'Pencak Silat': '🥋',
  'Powerlifting': '🏋️',
  'Rowing': '🚣',
  'Rugby': '🏉',
  'Sepak Takraw': '🏐',
  'Shooting': '🎯',
  'Shooting Ball': '🏐',
  'Skating': '⛸️',
  'Soft Tennis': '🎾',
  'Softball': '🥎',
  'Swimming': '🏊',
  'Table Tennis': '🏓',
  'Taekwondo': '🥋',
  'Tennikoit': '🥏',
  'Tennis': '🎾',
  'Thang-Ta': '⚔️',
  'Volleyball': '🏐',
  'Weightlifting': '🏋️',
  'Wrestling': '🤼',
  'Wushu': '🥋',
  'Yoga': '🧘',
  'Yogasana': '🧘',
};

/** Get the emoji for a discipline; "-Para" variants map to the base sport. Fallback: 🏅 */
export function getDisciplineIcon(discipline: string | null | undefined): string {
  if (!discipline) return '🏅';
  const base = discipline.replace(/\s*-\s*Para$/i, '').trim();
  return DISCIPLINE_ICONS[base] ?? '🏅';
}

/** Data rows that aren't real disciplines and should be hidden from pickers. */
export function isRealDiscipline(discipline: string): boolean {
  const junk = ['Yet to be Started', 'State has not shared any preference for Two disciplines'];
  return !junk.includes(discipline.trim());
}
