export const AVATAR_COLORS = [
  '#E57373', // red
  '#FF8A65', // deep orange
  '#FFB74D', // orange
  '#81C784', // green
  '#4DB6AC', // teal
  '#4FC3F7', // light blue
  '#9575CD', // purple
  '#F06292', // pink
] as const;

export function pickAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}
