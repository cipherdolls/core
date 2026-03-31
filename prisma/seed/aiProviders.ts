const { env } = process;


// Ollama
export const aiProviderOllamaSeed = {
  name: 'Ollama',
  basePath: `${env.OLLAMA_URL}/v1`,
};

export const aiProviderOllamaChatSeed = {
  name: 'Ollama Chat',
  basePath: `${env.OLLAMA_CHAT_URL}/v1`,
};
export const aiProviderOllamaReasoningSeed = {
  name: 'Ollama Reasoning',
  basePath: `${env.OLLAMA_REASONING_URL}/v1`,
};
export const aiProviderOllamaEmbeddingSeed = {
  name: 'Ollama Embedding',
  basePath: `${env.OLLAMA_EMBEDDING_URL}/v1`,
};



export const chatModelLlama32_1bOllamaSeed = {
  recommended: false,
  censored: true,
  providerModelName: 'llama3.2:1b',
  info: 'Meta Llama 3.2 1B - lightweight chat model for edge deployment (1.3GB)',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
  contextWindow: 128000,
};

export const chatModelMagnumV4MistralSmallOllamaSeed = {
  recommended: false,
  censored: false,
  providerModelName: 'HammerAI/magnum-v4-mistral-small:12b-q5_K_M',
  info: 'Magnum v4 Mistral Small 12B Q5_K_M - uncensored creative roleplay model (9GB, 32K context)',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
  contextWindow: 32768,
};

export const reasoningModelPhi4MiniOllamaSeed = {
  recommended: false,
  censored: false,
  providerModelName: 'phi4-mini-reasoning',
  info: 'Microsoft Phi-4 Mini Reasoning - compact reasoning model with chain-of-thought (2.8GB)',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
  contextWindow: 128000,
};




export const embeddingModelAllMinilm22mOllamaSeed = {
  recommended: false,
  providerModelName: 'all-minilm:22m',
  info: 'All-MiniLM 22M - tiny and fast embedding model (46MB)',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
};




// OpenRouter
export const aiProviderOpenRouterSeed = {
  name: 'OpenRouter',
  basePath: 'https://openrouter.ai/api/v1',
};
export const chatModelMythomaxOpenRouterSeed = {
  recommended: false,
  censored: false,
  providerModelName: 'gryphe/mythomax-l2-13b:nitro',
  dollarPerInputToken: 0.00000027,
  dollarPerOutputToken: 0.00000027,
  contextWindow: 4096,
};
export const chatModelDeepseekOpenRouterSeed = {
  recommended: false,
  censored: false,
  providerModelName: 'deepseek/deepseek-chat',
  dollarPerInputToken: 0.00000014,
  dollarPerOutputToken: 0.00000027,
  contextWindow: 4096,
};
export const chatModelHermes3OpenRouterSeed = {
  recommended: false,
  censored: true,
  name: 'Nous: Hermes 3 405B Instruc',
  providerModelName: 'nousresearch/hermes-3-llama-3.1-405b',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
  contextWindow: 4096,
};

// Groq
export const aiProviderGroqSeed = {
  name: 'Groq',
  basePath: 'https://api.groq.com/openai/v1',
};

//https://groq.com/pricing/
export const chatModel_groq_llama_3_3_70b_versatile_Seed = {
  recommended: false,
  censored: true,
  info: 'This is the Meta Llama 3.3 70B Versatile model',
  providerModelName: 'llama-3.3-70b-versatile',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
  contextWindow: 128000,
};

// Mixedbread
export const aiProviderMixedbreadSeed = {
  name: 'Mixedbread',
  basePath: 'https://api.mixedbread.ai/v1',
};
export const embeddingModelMxbaiLargeMixedbreadSeed = {
  recommended: false,
  providerModelName: 'mixedbread-ai/mxbai-embed-large-v1',
  info: 'This is the Mxbai Embed Large V1 model',
  dollarPerInputToken: 0,
  dollarPerOutputToken: 0,
};
