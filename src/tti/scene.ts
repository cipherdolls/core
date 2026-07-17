import { prisma, model } from '../db';
import { buildScenePrompt } from './prompt';

const SCENE_SYSTEM_PROMPT =
  'You are an art director creating a UNIQUE establishing shot for a roleplay scenario. ' +
  "Pick ONE specific, distinctive location that fits the scenario's theme, profession, genre, or era — the more particular the better (name the kind of place, its architecture, region, or period). " +
  'Then give: the location, time of day, season or weather, lighting, colour palette, and 2-3 concrete distinctive objects.\n' +
  'Rules:\n' +
  '- Vary widely: choose different times of day, seasons, weather, and setting TYPES (indoor/outdoor, urban/rural/nature/historical/fantasy/sci-fi). Do NOT default to cafes, bedrooms, or night-time rain.\n' +
  '- NEVER use these words: cozy, dimly lit, dim, warm glow, soft jazz, scattered papers, rainy, moody, inviting.\n' +
  '- No people, characters, names, dialogue, or actions — setting only.\n' +
  '- If no location is given, INVENT a specific evocative one matching the subject; never a generic cafe or living room.\n' +
  'Reply with ONE line of comma-separated concrete visual descriptors. No quotes, no preamble.';

/**
 * Distill a scenario's systemMessage into a visual scene description using the
 * scenario's OWN configured chat model (e.g. the free Scout model). Returns the
 * scene text, or null if the model is unavailable or returns nothing.
 */
export async function deriveScene(scenarioId: string): Promise<string | null> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { chatModel: { include: { aiProvider: true } } },
  });
  if (!scenario) return null;
  const provider = scenario.chatModel?.aiProvider;
  if (!provider) return null;

  try {
    const res = await fetch(`${provider.basePath}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: scenario.chatModel.providerModelName,
        messages: [
          { role: 'system', content: SCENE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Scenario: ${scenario.name}\n\n${scenario.systemMessage}` +
              (scenario.greeting ? `\n\nOpening line: ${scenario.greeting}` : ''),
          },
        ],
        // Higher temperature so scenes vary across the catalog.
        temperature: 0.85,
        max_tokens: 160,
      }),
    });
    if (!res.ok) {
      console.error(`[tti/scene] LLM ${res.status} for scenario ${scenarioId}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as any;
    // Take the first non-empty line (models sometimes append a list/notes),
    // strip quotes and any leading "Scene:"/"1." marker.
    const raw = (data.choices?.[0]?.message?.content ?? '').trim();
    const firstLine = raw.split('\n').map((l: string) => l.trim()).find(Boolean) ?? '';
    const scene = firstLine
      .replace(/^["']|["']$/g, '')
      .replace(/^(scene|setting)\s*:\s*/i, '')
      .replace(/^\d+[.)]\s*/, '')
      .slice(0, 600);
    return scene || null;
  } catch (e: any) {
    console.error(`[tti/scene] LLM call failed for scenario ${scenarioId}: ${e.message}`);
    return null;
  }
}

/**
 * Enqueue a picture generation for a scenario. Subject: the given scene, or
 * one derived from the scenario via its chat model. Returns the created job,
 * or null when no scene could be produced.
 */
export async function enqueueScenarioPicture(scenarioId: string, scene?: string) {
  const resolvedScene = scene ?? (await deriveScene(scenarioId));
  if (!resolvedScene) return null;

  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario) return null;

  console.log(`[tti/scene] Enqueueing picture for scenario ${scenario.name}: ${resolvedScene.slice(0, 80)}…`);
  return model.ttiJob.create({
    data: {
      prompt: buildScenePrompt(resolvedScene),
      scenario: { connect: { id: scenario.id } },
      user: { connect: { id: scenario.userId } },
      // Scenes are wide establishing shots.
      width: 1216,
      height: 832,
    },
  });
}
