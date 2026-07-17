import { prisma, model } from '../db';
import { buildPrompt, groupSubject, resolveStyle } from './prompt';

/**
 * Enqueue a cover generation for a group, derived from up to three member
 * avatars' appearances. No-op (returns false) when no member has an
 * appearance. Used when group membership changes and by /tti-jobs.
 */
export async function enqueueGroupCover(groupId: string): Promise<boolean> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { avatars: { where: { appearance: { not: null } }, take: 3, select: { appearance: true } } },
  });
  if (!group) return false;
  const appearances = group.avatars.map((a) => a.appearance!).filter(Boolean);
  if (appearances.length === 0) return false;

  const style = await resolveStyle();
  console.log(`[tti] Enqueueing cover for group ${group.slug} (${appearances.length} member appearances)`);
  await model.ttiJob.create({
    data: {
      prompt: buildPrompt(style.template, groupSubject(appearances)),
      group: { connect: { id: group.id } },
      user: { connect: { id: group.userId } },
      ...(style.id ? { ttiStyle: { connect: { id: style.id } } } : {}),
      // Covers are wide (group cards are landscape).
      width: 1216,
      height: 832,
    },
  });
  return true;
}
