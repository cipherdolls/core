import { prisma, model } from '../db';
import { buildScenePrompt } from './prompt';

const SCENE_SYSTEM_PROMPT =
  'You turn a roleplay scenario into a single vivid visual SCENE for an image generator. ' +
  'Describe ONLY the setting: location, environment, time of day, lighting, weather, mood, and notable objects. ' +
  'Do NOT include people, characters, names, dialogue, actions, instructions, or placeholders like {user}. ' +
  'Reply with one concise line of comma-separated visual descriptors. No quotes, no preamble.';

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
          { role: 'user', content: `Scenario: ${scenario.name}\n\n${scenario.systemMessage}` },
        ],
        temperature: 0.4,
        max_tokens: 160,
      }),
    });
    if (!res.ok) {
      console.error(`[tti/scene] LLM ${res.status} for scenario ${scenarioId}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as any;
    const scene = (data.choices?.[0]?.message?.content ?? '')
      .trim()
      .replace(/^["']|["']$/g, '')
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
