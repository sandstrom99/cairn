// order.ts: the two orders anything is ever listed in. Mint order for ids, because
// `cn-10` sorts before `cn-2` as a string and every list that did that was wrong; priority
// then age for work, because ready, list and an epic's open issues must agree on what
// comes first. Each was spelled inline at every site before, four and three times over.

/** `cn-10` after `cn-2`, and one project's ids before another's: mint order, not string order. */
export const idOrder = (a: { id: string }, b: { id: string }): number => {
  const [aSlug = "", aN = ""] = a.id.split(/-(?=\d+$)/);
  const [bSlug = "", bN = ""] = b.id.split(/-(?=\d+$)/);
  return aSlug.localeCompare(bSlug) || Number(aN) - Number(bN);
};

/** Priority first, 0 highest, then age, oldest first: the order ready, list and an epic's open issues share. */
export const priorityOrder = (
  a: { priority: number; _creationTime: number },
  b: { priority: number; _creationTime: number },
): number => a.priority - b.priority || a._creationTime - b._creationTime;
