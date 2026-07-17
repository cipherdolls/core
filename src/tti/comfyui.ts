/**
 * ComfyUI text-to-image client (self-hosted, Z-Image-Turbo).
 *
 * Talks to the ComfyUI HTTP API: POST /prompt with a workflow graph, poll
 * /history/{id}, download the result via /view. The endpoint sits behind
 * Traefik basicauth (ComfyUI itself has no auth).
 *
 * Env:
 *   COMFYUI_URL       e.g. https://comfyui.ffaerber.duckdns.org
 *   COMFYUI_USER      basicauth user (optional for in-swarm http://comfyui:8188)
 *   COMFYUI_PASSWORD  basicauth password
 */

const COMFYUI_URL = process.env.COMFYUI_URL ?? '';
const COMFYUI_USER = process.env.COMFYUI_USER ?? '';
const COMFYUI_PASSWORD = process.env.COMFYUI_PASSWORD ?? '';

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // cold start loads ~20GB of weights from NFS
const POLL_INTERVAL_MS = 2000;

function authHeaders(): Record<string, string> {
  if (!COMFYUI_USER) return {};
  return { Authorization: `Basic ${Buffer.from(`${COMFYUI_USER}:${COMFYUI_PASSWORD}`).toString('base64')}` };
}

/** Z-Image-Turbo workflow (settings from the official ComfyUI template). */
function buildWorkflow(prompt: string, seed: number, width: number, height: number) {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'ModelSamplingAuraFlow', inputs: { shift: 3.0, model: ['1', 0] } },
    '3': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['3', 0] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['3', 0] } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '7': {
      class_type: 'KSampler',
      inputs: {
        seed, steps: 8, cfg: 1.0, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1.0,
        model: ['2', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
      },
    },
    '8': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { filename_prefix: 'cipherdolls', images: ['9', 0] } },
  };
}

/** Generate an image. Returns the PNG bytes. */
export async function generateImage(
  prompt: string,
  opts: { seed?: number; width?: number; height?: number } = {},
): Promise<Buffer> {
  if (!COMFYUI_URL) throw new Error('COMFYUI_URL not set');
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const width = opts.width ?? 832;
  const height = opts.height ?? 1216;

  const submit = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ prompt: buildWorkflow(prompt, seed, width, height) }),
  });
  if (!submit.ok) throw new Error(`ComfyUI /prompt failed (${submit.status}): ${(await submit.text()).slice(0, 300)}`);
  const { prompt_id: promptId } = (await submit.json()) as { prompt_id: string };

  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${COMFYUI_URL}/history/${promptId}`, { headers: authHeaders() });
    if (res.ok) {
      const history = (await res.json()) as Record<string, any>;
      const entry = history[promptId];
      if (entry && (entry.status?.completed || entry.outputs)) {
        if (entry.status?.status_str === 'error') {
          throw new Error(`ComfyUI generation failed: ${JSON.stringify(entry.status?.messages ?? '').slice(0, 300)}`);
        }
        const image = entry.outputs?.['10']?.images?.[0];
        if (image) {
          const query = new URLSearchParams({
            filename: image.filename,
            subfolder: image.subfolder ?? '',
            type: image.type ?? 'output',
          });
          const view = await fetch(`${COMFYUI_URL}/view?${query}`, { headers: authHeaders() });
          if (!view.ok) throw new Error(`ComfyUI /view failed (${view.status})`);
          return Buffer.from(await view.arrayBuffer());
        }
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`ComfyUI generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s`);
}
