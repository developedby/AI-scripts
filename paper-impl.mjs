#!/usr/bin/env node

import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { chat, MODELS } from './Chat.mjs';
import { readdir } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Get model from environment variable or use default
const MODEL = "c";

console.log(`Welcome to paper-impl. Model: ${MODELS[MODEL] || MODEL}\n`);

const execAsync = promisify(exec);

// System prompt to set the assistant's behavior
const SYSTEM_PROMPT = `You are a helpful AI assistant specializing in implementing algorithms from academic papers. Your goal is to produce clear, understandable implementations that closely follow the paper's description while maintaining simplicity and readability.

Guidelines:
- Produce clean, well-documented Haskell code that mirrors the paper's algorithm description
- Focus on clarity and understandability over performance optimizations
- Include explanatory comments that connect the code to specific sections/equations in the paper. When possible, try to point to the specific sections and subsections in the paper that the code is implementing.
- Keep the implementation as simple as possible while maintaining correctness
- ALWAYS implement the paper in its entirety. If more than one section is relevant, implement them all. If more than one algorithm is relevant, implement them all. DO NOT leave any functions undefined or "to be implemented".
- Point out any assumptions or simplifications made in the implementation
- A reference implementation may be provided in a <REFERENCE> tag. If it implements the algorithms in the paper, use it to verify correctness but translate to idiomatic Haskell. Otherwise, use it as a reference for the code structure but don't use its logic.
- Make sure that the main file is executable, with a main function calling a usage example of the algorithm or system. Make sure that it is a valid Haskell program that can be compiled.
- Make the input of the main function a string that gets parsed into the relevant data structure. Don't use a lexer, just parse the string directly.
- Some additional context may be provided in a <CONTEXT> tag. The context can contain additional explanations about the paper or requests about how the algorithm should be implemented. If it contains any requests, they should take priority over all the other rules in the guidelines.

Output Format Rules:
- Always output code as bash commands using 'cat' with heredoc
- All bash commands we wish executed must be wrapped in <CODE index="N">...</CODE> tags
- Use meaningful filenames that reflect the algorithm or data structure
- Include all necessary module imports and exports
- Don't split complex implementations into multiple files, try to keep everything in one file
- The system shell in use is: ${await get_shell()}

Example Output:
<CODE index="0">
cat > QuickSort.hs << EOL
module QuickSort where

quickSort :: Ord a => [a] -> [a]
quickSort [] = []
quickSort (x:xs) = quickSort lesser ++ [x] ++ quickSort greater
  where
    lesser = filter (< x) xs
    greater = filter (>= x) xs
EOL
</CODE>

When code is executed, I will respond with corresponding <OUTPUT index="N"> tags containing the execution results.

Please structure your response as follows:
1. Brief summary of the algorithm from the paper
2. Key implementation decisions/assumptions
3. The Haskell implementation with code in <CODE> blocks using cat commands
4. Brief explanation of how the code maps to the paper's description

After converting the paper to code, you'll be asked further questions and modifications to the code.
- When modifications need to be made, always rewrite the ENTIRE file with the new code.
- When other commands need to be executed, assume that all the dependencies are already installed. This includes libraries, compilers, and any other tools needed to compile the code. Don't install anything.
- Don't create a cabal project or any other build system. If we need to compile or run the code, just use 'ghc' and 'runghc'.
- When asked to run the code, use 'runghc <file name>' to run the main function. When asked to compile the code, use 'ghc <file name>' to compile the main file. Don't use 'ghc -o <output file> <file name>', just use 'ghc <file name>'.
`;


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
    process.stdout.write('\x1b[1m');  // bold
    rl.question(query, resolve);
    process.stdout.write('\x1b[0m');  // reset
  });
}

async function get_shell() {
  const shellInfo = (await execAsync('uname -a && $SHELL --version')).stdout.trim();
  return shellInfo;
}

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
    .map(file => {
      // Construct full path based on the directory structure
      const relativePath = file.path ? path.join(file.path, file.name) : file.name;
      return path.join(dir, relativePath);
    });
}

function extractCodeBlocks(text) {
  const matches = [];
  const regex = /<CODE index="(\d+)">([\s\S]*?)<\/CODE>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      index: match[1],
      code: match[2].trim()
    });
  }
  return matches;
}

async function executeCode(code) {
  console.log("\x1b[34m=== Executing code ===\x1b[0m");
  try {
    const { stdout, stderr } = await execAsync(code);
    const output = `${stdout.trim()}${stderr.trim()}`;
    if (output) {
      console.log('\x1b[2m' + output.trim() + '\x1b[0m');
    }
    return output;
  } catch (error) {
    const output = `${error.stdout?.trim() || ''}${error.stderr?.trim() || ''}`;
    console.error('\x1b[31mError:\x1b[0m\n' + output.trim());
    return output;
  }
}

// Extract code block, prompt user and then execute the code
async function tryCode(response) {
  const codeBlocks = extractCodeBlocks(response);

  if (codeBlocks.length === 0) return "";

  let allOutput = "";
  for (const block of codeBlocks) {
    // Get preview of the code block
    const preview = block.code.split('\n')[0].slice(0, 60) +
      (block.code.split('\n')[0].length > 60 ? '...' : '');

    console.log(`\n\x1b[33mCode block ${block.index}/${codeBlocks.length}:\x1b[0m ${preview}`);
    const answer = await prompt('Execute? (Y/n) ');

    if (answer.toLowerCase() !== 'n') {
      const output = await executeCode(block.code);
      allOutput += `<OUTPUT index="${block.index}">\n${output}\n</OUTPUT>\n\n`;
    } else {
      allOutput += `<OUTPUT index="${block.index}">\nSkipped\n</OUTPUT>\n\n`;
    }
  }
  return allOutput;
}


const HISTORY_DIR = path.join(os.homedir(), '.ai', 'chatsh_history');

// Ensure the history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

async function conversation_loop() {
  // Start conversation loop
  console.log("\nYou can now ask questions about the paper or request implementation changes.");
  console.log("Type 'exit' to end the conversation.\n");

  let execOutput = "";

  while (true) {
    const userMessage = await prompt('λ ');

    if (userMessage.toLowerCase() === 'exit') {
      break;
    }

    try {
      const fullMessage = `${execOutput}\n\n${userMessage}`;
      execOutput = ""; // Clear after use

      const question_resp = await ask(fullMessage, {
        system: SYSTEM_PROMPT,
        model: MODEL,
        max_tokens: 8192,
        system_cacheable: true
      });
      console.log();

      // Extract and execute code blocks
      execOutput = await tryCode(question_resp);

      if (execOutput) {
        console.log("\n\x1b[34m=== Execution complete. Next message will include the results ===\x1b[0m\n");
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      execOutput = ""; // Clear on error
    }
  }
}

// Main interaction loop
async function main() {
  const matches = await findPdfFiles(paper_name);
  if (matches.length === 0) {
    console.error('No PDF files found');
    process.exit(1);
  }
  var pdf_b64 = null;
  for (let i = 0; i < matches.length; i++) {
    const fullPath = matches[i];
    process.stdout.write('\x1b[1m');  // bold
    console.log(`Is this the correct file (${i + 1}/${matches.length})? ${fullPath}`);
    process.stdout.write('\x1b[0m');  // reset
    const answer = await prompt(`(Y/n) `);
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === "") {
      pdf_b64 = await fs.promises.readFile(fullPath, { encoding: 'base64' });
      break;
    }
  }
  if (!pdf_b64) {
    console.error('No PDF file selected');
    process.exit(1);
  }

  // Build the request message
  let message = "Please implement the algorithm described in this paper in Haskell. ";
  let context = null;
  let reference = null;

  // Add reference implementation if provided
  if (ref_impl) {
    reference = await fs.promises.readFile(ref_impl, 'utf8');
  }

  // Add additional context if provided
  if (context_msg) {
    if (fs.existsSync(context_msg)) {
      context = await fs.promises.readFile(context_msg, 'utf8');
    } else {
      context = context_msg;
    }
  }

  if (reference) {
    message += `<REFERENCE>\n${reference}\n</REFERENCE>\n\n`;
  }

  if (context) {
    message += `<CONTEXT>\n${context}\n</CONTEXT>\n\n`;
  }

  message += "Please provide a clean, simple Haskell implementation that focuses on clarity and understandability.";

  console.log(`Analyzing paper...`);

  const pdf_resp = await askPdf(pdf_b64, message, {
    system: SYSTEM_PROMPT,
    model: MODEL,
    max_tokens: 8192,
    system_cacheable: true
  });

  await tryCode(pdf_resp);

  await conversation_loop();

  process.exit();
}

main();
