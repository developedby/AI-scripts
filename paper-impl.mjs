#!/usr/bin/env node

import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { chat, MODELS } from './Chat.mjs';

const execAsync = promisify(exec);

// Get model from environment variable or use default
const MODEL = "c";

console.log(`Welcome to ChatSH. Model: ${MODELS[MODEL] || MODEL}\n`);

// System prompt to set the assistant's behavior
const SYSTEM_PROMPT = `You are a helpful AI assistant specializing in implementing algorithms from academic papers. Your goal is to produce clear, understandable implementations that closely follow the paper's description while maintaining simplicity and readability.

Guidelines:
- Produce clean, well-documented Haskell code that mirrors the paper's algorithm description
- Focus on clarity and understandability over performance optimizations
- Include explanatory comments that connect the code to specific sections/equations in the paper
- When a reference implementation is provided, use it to verify correctness but translate to idiomatic Haskell
- Keep the implementation as simple as possible while maintaining correctness
- Point out any assumptions or simplifications made in the implementation

Please structure your response as follows:
1. Brief summary of the algorithm from the paper
2. Key implementation decisions/assumptions
3. The Haskell implementation with comments
4. Brief explanation of how the code maps to the paper's description`;
;

// Create readline interface for user input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

// Create a stateful asker
const { ask, askPdf } = chat(MODEL);

// Utility function to prompt the user for input
async function prompt(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

//
// paper-impl implementation
//

import { readdir } from 'fs/promises';

var paper_name = process.argv[2];
var ref_impl = process.argv[3];
var context_msg = process.argv[4];

async function findPdfFiles(searchString, dir = '../papers') {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });

  return files
    .filter(file =>
      file.isFile() &&
      file.name.toLowerCase().includes(searchString.toLowerCase()) &&
      file.name.endsWith('.pdf'))
    .map(file => path.join(dir, file.name));
}

//
// end of paper-impl implementation
//

import fs from 'fs';
import path from 'path';
import os from 'os';

const HISTORY_DIR = path.join(os.homedir(), '.ai', 'chatsh_history');

// Ensure the history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// Generate a unique filename for this conversation
const conversationFile = path.join(HISTORY_DIR, `conversation_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);

// Function to append message to the conversation file
function appendToHistory(role, message) {
  const formattedMessage = `<${role}>\n${message}\n</${role}>\n\n`;
  fs.appendFileSync(conversationFile, formattedMessage);
}

// Main interaction loop
async function main() {
  const matches = await findPdfFiles(paper_name);
  if (matches.length === 0) {
    console.error('No PDF files found');
    process.exit(1);
  }
  var pdf_b64 = null;
  for (const fullPath of matches) {
    console.log(`Found PDF: ${fullPath}`);
    const answer = await prompt('Is this the correct file? (Y/n) ');
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === "") {
      pdf_b64 = await fs.promises.readFile(fullPath, { encoding: 'base64' });
      break;
    }
  }
  if (!pdf_b64) {
    console.error('No PDF file selected');
    process.exit(1);
  }
  //console.log(pdfBase64);
  //assistantMessage = await ask(fullMessage, { system: SYSTEM_PROMPT, model: MODEL, max_tokens: 8192, system_cacheable: true });  

  // Build the request message
  let message = "Please implement the algorithm described in this paper in Haskell. ";

  // Add reference implementation context if provided
  if (ref_impl) {
    const ref_code = await fs.promises.readFile(ref_impl, 'utf8');
    message += `Here is a reference implementation in Rust:\n\n${ref_code}\n\n`;
  }

  // Add additional context if provided
  if (context_msg) {
    const context = await fs.promises.readFile(context_msg, 'utf8');
    message += `Additional context: ${context}\n\n`;
  }

  message += "Please provide a clean, simple Haskell implementation that focuses on clarity and understandability.";

  console.log(`Analyzing paper...`);

  const response = await askPdf(pdf_b64, message, {
    system: SYSTEM_PROMPT,
    model: MODEL,
    max_tokens: 8192,
    system_cacheable: true
  });

  console.log(response);


  // Start conversation loop
  console.log("\nYou can now ask questions about the paper or request implementation changes.");
  console.log("Type 'exit' to end the conversation.\n");

  while (true) {
    process.stdout.write('\x1b[1m');  // bold
    const userMessage = await prompt('λ ');
    process.stdout.write('\x1b[0m');  // reset

    if (userMessage.toLowerCase() === 'exit') {
      break;
    }

    try {
      // Use regular ask for follow-up questions since PDF is already in context
      await ask(userMessage, {
        system: SYSTEM_PROMPT,
        model: MODEL,
        max_tokens: 8192,
        system_cacheable: true
      });
      console.log();
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }

  process.exit();
}

main();
