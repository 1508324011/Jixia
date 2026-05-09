export interface RecentOpenedItem {
  id: string;
  title: string;
  context: string;
  kind: 'paper' | 'project' | 'document';
}

export function getRecentOpenedItems(): RecentOpenedItem[] {
  return [];
}
