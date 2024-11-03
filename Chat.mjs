import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { OpenAI } from "openai";
import { Anthropic } from '@anthropic-ai/sdk';
import { OpenRouter } from "@openrouter/ai-sdk-provider";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { encode } from "gpt-tokenizer/esm/model/davinci-codex"; // tokenizer

// Map of model shortcodes to full model names
export const MODELS = {
  // GPT by OpenAI
  gm: 'gpt-4o-mini',
  g: 'gpt-4o-2024-08-06',
  G: 'gpt-4-32k-0314',

  // o1 by OpenAI
  om: 'o1-mini',
  o: 'o1-preview',

  // Claude by Anthropic
  cm: 'claude-3-haiku-20240307',
  //c: 'claude-3-5-sonnet-20240620',
  c: 'claude-3-5-sonnet-20241022',
  C: 'claude-3-opus-20240229',

  // Llama by Meta
  lm: 'meta-llama/llama-3.1-8b-instruct',
  l: 'meta-llama/llama-3.1-70b-instruct',
  L: 'meta-llama/llama-3.1-405b-instruct',

  // Gemini by Google
  i: 'gemini-1.5-flash-latest',
  I: 'gemini-1.5-pro-exp-0801'
};


// Factory function to create a stateful Anthropic chat
export function anthropicChat(clientClass, MODEL) {
  const messages = [];

  async function ask(userMessage, { system, model, temperature = 0.0, max_tokens = 8192, stream = true, system_cacheable = false, shorten = (x => x), extend = null }) {
    if (userMessage === null) {
      return { messages };
    }

    model = model || MODEL;
    model = MODELS[model] || model;
    const client = new clientClass({
      apiKey: await getToken(clientClass.name.toLowerCase()),
    });

    let extendedUserMessage = extend ? extend(userMessage) : userMessage;

    const userMsg = {
      role: "user",
      content: [{ type: "text", text: extendedUserMessage }]
    };

    const messagesCopy = [...messages, userMsg];
    messages.push({ role: "user", content: userMessage });

    let result = "";
    const response = await client.beta.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      betas: ["pdfs-2024-09-25", "prompt-caching-2024-07-31"],
      max_tokens,
      temperature,
      stream: true,
      system: system_cacheable ?
        [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] :
        system,
      messages: messagesCopy,
    });

    for await (const messageStreamEvent of response) {
      if (messageStreamEvent.type === 'content_block_delta') {
        if (stream) {
          process.stdout.write(messageStreamEvent.delta.text);
        }
        result += messageStreamEvent.delta.text;
      }
    }

    messages.push({ role: 'assistant', content: await shorten(result) });

    return result;
  }

  async function askPdf(pdfBase64, userMessage, { system, model, temperature = 0.0, max_tokens = 8192, stream = true, system_cacheable = false }) {
    model = model || MODEL;
    model = MODELS[model] || model;
    const client = new clientClass({
      apiKey: await getToken(clientClass.name.toLowerCase()),
    });

    // Store the PDF message in the buffer
    const pdfMessage = {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            media_type: 'application/pdf',
            type: 'base64',
            data: pdfBase64,
          },
        },
        {
          type: 'text',
          text: userMessage,
        },
      ]
    };
    messages.push(pdfMessage);

    let result = "";
    const response = await client.beta.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      betas: ["pdfs-2024-09-25", "prompt-caching-2024-07-31"],
      max_tokens,
      temperature,
      stream: true,
      system: system_cacheable ?
        [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] :
        system,
      messages: [...messages],
    });

    for await (const messageStreamEvent of response) {
      if (messageStreamEvent.type === 'content_block_delta') {
        if (stream) {
          process.stdout.write(messageStreamEvent.delta.text);
        }
        result += messageStreamEvent.delta.text;
      }
    }

    // Store the assistant's response
    messages.push({ role: 'assistant', content: result });
    return result;
  }

  return { ask, askPdf };
}


// Generic asker function that dispatches to the correct asker based on the model name
export function chat(model) {
  model = MODELS[model] || model;
  if (model.startsWith('claude')) {
    return anthropicChat(Anthropic, model);
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
}

// Utility function to read the API token for a given vendor
async function getToken(vendor) {
  const tokenPath = path.join(os.homedir(), '.config', `${vendor}.token`);
  try {
    return (await fs.readFile(tokenPath, 'utf8')).trim();
  } catch (err) {
    console.error(`Error reading ${vendor}.token file:`, err.message);
    process.exit(1);
  }
}

export function tokenCount(inputText) {
  // Encode the input string into tokens
  const tokens = encode(inputText);

  // Get the number of tokens 
  const numberOfTokens = tokens.length;

  // Return the number of tokens
  return numberOfTokens;
}
