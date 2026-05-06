export interface RecentOpenedItem {
  id: string;
  title: string;
  context: string;
  kind: 'paper' | 'project' | 'document';
}

const recentOpenedItems: RecentOpenedItem[] = [
  {
    id: 'entry-1',
    title: 'Signal pathways in shared tumor boards',
    context: 'Paper · Personal',
    kind: 'paper',
  },
  {
    id: 'project-1',
    title: '肿瘤标志物项目',
    context: 'Project · Shared workspace',
    kind: 'project',
  },
  {
    id: 'doc-1',
    title: 'Tumor board literature synthesis',
    context: 'Writer · Draft in progress',
    kind: 'document',
  },
];

export function getRecentOpenedItems(): RecentOpenedItem[] {
  return recentOpenedItems;
}
