#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { chat, MODELS } from './Chat.mjs';

const SYSTEM_PROMPT = `
You are an expert Agda <-> Kind compiler. Your task is to translate Agda to/from Kind.

Follow these rules:

- Represent Agda's 'Char' as a Kind 'U32', and Agda's 'String' as a Kind '(List U32)'.
- Always use holes ('_') for type parameters, since these can be inferred.
- Do not compile infix operators (like '+') to Kind. Just skip them completely.
- Always translate Agda's pattern-matching equations to nested λ-matches.

Avoid the following common errors:

(TODO)

About Kind:

Kind is a minimal language based on the Calculus of Constructors. Grammar:

<Term> ::=
  | ALL: "∀(" <Name> ":" <Term> ")" <Term>
  | LAM: "λ" <Name> <Term>
  | APP: "(" <Term> <Term> ")"
  | ANN: "{" <Name> ":" <Term> "}"
  | SLF: "$(" <Name> ":" <Term> ")" <Term>
  | INS: "~" <Term>
  | DAT: "#[" <Term>* "]" "{" ("#" <Name> "{" (<Name> ":" <Term>)* "}" ":" <Term>)* "}"
  | CON: "#" <Name> "{" <Term>* "}"
  | SWI: "λ{0:" <Term> "_:" <Term> "}"
  | MAT: "λ{" ("#" <Name> ":" <Term>)* "}"
  | REF: <Name>
  | LET: "let" <Name> "=" <Term> <Term>
  | SET: "*"
  | NUM: <Numb>
  | OP2: "(" ("+"|"-"|"*"|"/"|"%"|"<="|">="|"<"|">"|"=="|"!="|"&"|"|"|"^"|"<<"|">>") <Term> <Term> ")"
  | TXT: '"' <string-literal> '"'
  | HOL: "?" <Name> ("[" <Term> ("," <Term>)* "]")?
  | MET: "_" <Numb>

About lambda-match:

A λ-match is a lambda that performs a pattern-match on its argument. For example, consider:

    foo (Succ n) = (f n)
    foo Zero     = g

Without λ-match, this would be translated to:

    foo = λx match x { Succ: λn (f n) Zero: g }

With λ-match, the 'λ' and the 'match' are fused, becoming just:

    foo = λ{ Succ: λn (f n) Zero: g }

Examples:

# Base/Bool/Bool.agda

\`\`\`agda
module Base.Bool.Bool where

-- Represents a Boolean value.
-- - True: Represents logical truth.
-- - False: Represents logical falsehood.
data Bool : Set where
  True  : Bool
  False : Bool
{-# BUILTIN BOOL  Bool  #-}
{-# BUILTIN TRUE  True  #-}
{-# BUILTIN FALSE False #-}
\`\`\`

# Base/Bool/Bool.kind

\`\`\`kind
use Base/Bool/ as B/

// Represents a Boolean value.
// - True: Represents logical truth.
// - False: Represents logical falsehood.
B/Bool : * = #[]{
  #True{} : B/Bool
  #False{} : B/Bool
}
\`\`\`

# Base/Bool/and.agda

\`\`\`agda
module Base.Bool.and where

open import Base.Bool.Bool

-- Performs logical AND operation on two boolean values.
-- - a: The 1st boolean value.
-- - b: The 2nd boolean value.
-- = True if both a and b are true.
and : Bool → Bool → Bool
and True  b = b
and False b = False

_&&_ : Bool → Bool → Bool
_&&_ = and

infixr 6 _&&_
\`\`\`

# Base/Bool/and.kind

\`\`\`kind
use Base/Bool/ as B/

// Performs logical AND operation on two boolean values.
// - a: The 1st boolean value.
// - b: The 2nd boolean value.
// = True if both 'a' and 'b' are true, False otherwise.
B/and
: ∀(a: B/Bool)
  ∀(b: B/Bool)
  B/Bool
= λ{
  #True: λb b
  #False: λb #False{}
}
\`\`\`

# Base/Bool/if.agda

\`\`\`agda
module Base.Bool.if where

open import Base.Bool.Bool

-- Conditional expression.
-- - x: The boolean condition to evaluate.
-- - t: The value to return if the condition is true.
-- - f: The value to return if the condition is false.
-- = Either t or f, depending on the condition.
if_then_else_ : ∀ {a} {A : Set a} → Bool → A → A → A
if True  then t else _ = t
if False then _ else f = f

infix 0 if_then_else_
\`\`\`

# Base/Bool/if.kind

\`\`\`kind
use Base/Bool/ as B/

// Conditional expression.
// - A: The type of the result.
// - x: The boolean condition to evaluate.
// - t: The value to return if the condition is true.
// - f: The value to return if the condition is false.
// = Either t or f, depending on the condition.
B/if
: ∀(A: *)
  ∀(x: B/Bool)
  ∀(t: A)
  ∀(f: A)
  A
= λA λ{
  #True: λt λf t
  #False: λt λf f
}
\`\`\`

# Base/Maybe/Maybe.agda

\`\`\`agda
module Base.Maybe.Maybe where

-- Represents an optional value.
-- - None: Represents the absence of a value.
-- - Some: Represents the presence of a value.
data Maybe {a} (A : Set a) : Set a where
  None : Maybe A
  Some : A → Maybe A
{-# BUILTIN MAYBE Maybe #-}
\`\`\`

# Base/Maybe/Maybe.kind

\`\`\`kind
use Base/Maybe/ as M/

// Represents an optional value.
// - None: Represents the absence of a value.
// - Some: Represents the presence of a value.
M/Maybe
: ∀(A: *)
  *
= λA #[]{
  #None{} : (M/Maybe A)
  #Some{ value:A } : (M/Maybe A)
}
\`\`\`

# Base/Nat/Nat.agda

\`\`\`agda
module Base.Nat.Nat where

-- Represents nats.
-- - Zero: The zero nat.
-- - Succ: The successor of a nat.
data Nat : Set where
  Zero : Nat
  Succ : Nat → Nat

{-# BUILTIN NATURAL Nat #-}
\`\`\`

# Base/Nat/Nat.kind

\`\`\`kind
use Base/Nat/ as N/

// Represents nats.
// - Zero: The zero nat.
// - Succ: The successor of a nat.
N/Nat : * = #[]{
  #Zero{} : N/Nat
  #Succ{ pred: N/Nat } : N/Nat
}
\`\`\`

# Base/Nat/add.agda

\`\`\`agda
module Base.Nat.add where

open import Base.Nat.Nat

-- Addition of nats.
-- - m: The 1st nat.
-- - n: The 2nd nat.
-- = The sum of m and n.
add : Nat → Nat → Nat
add Zero     n = n
add (Succ m) n = Succ (add m n)

_+_ : Nat → Nat → Nat
_+_ = add

{-# BUILTIN NATPLUS _+_ #-}
\`\`\`

# Base/Nat/add.kind

\`\`\`kind
use Base/Nat/ as N/

// Addition of nats.
// - m: The 1st nat.
// - n: The 2nd nat.
// = The sum of m and n.
N/add
: ∀(m: N/Nat)
  ∀(n: N/Nat)
  N/Nat
= λ{
  #Zero: λn n
  #Succ: λm.pred λn #Succ{(N/add m.pred n)}
}
\`\`\`

# Base/Nat/half.agda

\`\`\`agda
module Base.Nat.half where

open import Base.Nat.Nat

-- Calculates half of a nat.
-- - n: The number to halve.
-- = The largest nat not exceeding n/2.
half : Nat -> Nat
half Zero            = Zero
half (Succ Zero)     = Zero
half (Succ (Succ n)) = Succ (half n)
\`\`\`

# Base/Nat/half.kind

\`\`\`kind
use Base/Nat/ as N/

// Calculates half of a nat.
// - n: The number to halve.
// = The largest nat not exceeding n/2.
N/half
: ∀(n: N/Nat)
  N/Nat
= λ{
  #Zero: #Zero{}
  #Succ: λ{
    #Zero: #Zero{}
    #Succ: λn.pred.pred #Succ{(N/half n.pred.pred)}
  }
}
\`\`\`

# Base/Nat/eq.agda

\`\`\`agda
module Base.Nat.eq where

open import Base.Nat.Nat
open import Base.Bool.Bool

-- Checks if two nats are equal.
-- - m: The 1st nat.
-- - n: The 2nd nat.
-- = True if m and n are equal, False otherwise.
eq : Nat -> Nat -> Bool
eq Zero     Zero     = True
eq (Succ m) (Succ n) = eq m n
eq _        _        = False

infix 4 _==_
_==_ : Nat -> Nat -> Bool
_==_ = eq
\`\`\`

# Base/Nat/eq.kind

\`\`\`kind
use Base/Nat/ as N/
use Base/Bool/ as B/

// Checks if two nats are equal.
// - m: The 1st nat.
// - n: The 2nd nat.
// = True if m and n are equal, False otherwise.
N/eq
: ∀(m: N/Nat)
  ∀(n: N/Nat)
  B/Bool
= λ{
  #Zero: λ{
    #Zero: #True{}
    #Succ: λn.pred #False{}
  }
  #Succ: λm.pred λ{
    #Zero: #False{}
    #Succ: λn.pred (N/eq m.pred n.pred)
  }
}
\`\`\`

# Base/List/List.agda

\`\`\`agda
module Base.List.List where

-- A polymorphic List with two constructors:
-- - _::_ : Appends an element to a list.
-- - []  : The empty list.
data List {a} (A : Set a) : Set a where
  []   : List A
  _::_ : (head : A) (tail : List A) → List A
{-# BUILTIN LIST List #-}

infixr 5 _::_
\`\`\`

# Base/List/List.kind

\`\`\`kind
use Base/List/ as L/

// A polymorphic List with two constructors:
// - Cons: Appends an element to a list.
// - Nil: The empty list.
L/List
: ∀(A: *)
  *
= λA #[]{
  #Nil{} : (L/List A)
  #Cons{ head:A tail:(L/List A) } : (L/List A)
}
\`\`\`

# Base/List/head.agda

\`\`\`agda
module Base.List.head where

open import Base.List.List
open import Base.Maybe.Maybe

-- Safely retrieves the 1st element of a list.
-- - A: The type of elements in the list.
-- - xs: The input list.
-- = Some x if the list is non-empty (where x is the 1st element),
--   None if the list is empty.
head : ∀ {A : Set} → List A → Maybe A
head []       = None
head (x :: _) = Some x
\`\`\`

# Base/List/head.kind

\`\`\`kind
use Base/List/ as L/
use Base/Maybe/ as M/

// Safely retrieves the 1st element of a list.
// - A: The type of elements in the list.
// - xs: The input list.
// = Some x if the list is non-empty (where x is the 1st element),
//   None if the list is empty.
L/head
: ∀(A: *)
  ∀(xs: (L/List A))
  (M/Maybe A)
= λA λ{
  #Nil: #None{}
  #Cons: λxs.head λxs.tail #Some{ xs.head }
}
\`\`\`

# Base/List/foldr.agda

\`\`\`agda
module Base.List.foldr where

open import Base.List.List

-- Performs a right fold over a list.
// - A: The type of elements in the input list.
// - B: The type of the result.
-- - co: The combining function.
-- - ni: The initial value (for the empty list case).
-- - xs: The list to fold over.
-- = The result of folding the list.
foldr : ∀ {a b} {A : Set a} {B : Set b} -> (A -> B -> B) -> B -> List A -> B
foldr co ni []        = ni
foldr co ni (x :: xs) = co x (foldr co ni xs)
\`\`\`

# Base/List/foldr.kind

\`\`\`kind
use Base/List/ as L/

// Performs a right fold over a list.
// - A: The type of elements in the input list.
// - B: The type of the result.
// - co: The combining function.
// - ni: The initial value (for the empty list case).
// - xs: The list to fold over.
// = The result of folding the list.
L/foldr
: ∀(A: *)
  ∀(B: *)
  ∀(co: ∀(head: A) ∀(tail: B) B)
  ∀(ni: B)
  ∀(xs: (L/List A))
  B
= λA λB λco λni λ{
  #Nil: ni
  #Cons: λxs.head λxs.tail (co xs.head (L/foldr _ _ co ni xs.tail))
}
\`\`\`

# Base/Bits/Bits.agda

\`\`\`agda
module Base.Bits.Bits where

-- Represents a binary string.
-- - O: Represents a zero bit.
-- - I: Represents a one bit.
-- - E: Represents the end of the binary string.
data Bits : Set where
  O : (tail : Bits) → Bits
  I : (tail : Bits) → Bits
  E : Bits
\`\`\`

# Base/Bits/Bits.kind

\`\`\`kind
use Base/Bits/ as BS/

// Represents a binary string.
// - O: Represents a zero bit.
// - I: Represents a one bit.
// - E: Represents the end of the binary string.
BS/Bits : * = #[]{
  #O{ tail: BS/Bits } : BS/Bits
  #I{ tail: BS/Bits } : BS/Bits
  #E{} : BS/Bits
}
\`\`\`

# Base/Bits/xor.agda

\`\`\`agda
module Base.Bits.xor where

open import Base.Bits.Bits

-- Performs bitwise XOR operation on two Bits values.
-- - a: The 1st Bits value.
-- - b: The 2nd Bits value.
-- = A new Bits value representing the bitwise XOR of a and b.
xor : Bits → Bits → Bits
xor E     E     = E
xor E     b     = b
xor a     E     = a
xor (O a) (O b) = O (xor a b)
xor (O a) (I b) = I (xor a b)
xor (I a) (O b) = I (xor a b)
xor (I a) (I b) = O (xor a b)

-- Infix operator for bitwise XOR
_^_ : Bits → Bits → Bits
_^_ = xor

infixr 5 _^_
\`\`\`

# Base/Bits/xor.kind

\`\`\`kind
use Base/Bits/ as BS/

// Performs bitwise XOR operation on two Bits values.
// - a: The 1st Bits value.
// - b: The 2nd Bits value.
// = A new Bits value representing the bitwise XOR of a and b.
BS/xor
: ∀(a: BS/Bits)
  ∀(b: BS/Bits)
  BS/Bits
= λ{
  #E: λb b
  #O: λa.tail λ{
    #E: #O{a.tail}
    #O: λb.tail #O{(BS/xor a.tail b.tail)}
    #I: λb.tail #I{(BS/xor a.tail b.tail)}
  }
  #I: λa.tail λ{
    #E: #I{a.tail}
    #O: λb.tail #I{(BS/xor a.tail b.tail)}
    #I: λb.tail #O{(BS/xor a.tail b.tail)}
  }
}
\`\`\`

# Base/Bits/eq.agda

\`\`\`agda
module Base.Bits.eq where

open import Base.Bits.Bits
open import Base.Bool.Bool

-- Checks if two Bits values are equal.
-- - a: The 1st Bits value.
-- - b: The 2nd Bits value.
-- = True if a and b are equal, False otherwise.
eq : Bits -> Bits -> Bool
eq E     E     = True
eq (O x) (O y) = eq x y
eq (I x) (I y) = eq x y
eq _     _     = False

infix 4 _==_
_==_ : Bits -> Bits -> Bool
_==_ = eq
\`\`\`

# Base/Bits/eq.kind

\`\`\`kind
use Base/Bits/ as BS/
use Base/Bool/ as B/

// Checks if two Bits values are equal.
// - a: The 1st Bits value.
// - b: The 2nd Bits value.
// = True if a and b are equal, False otherwise.
BS/eq
: ∀(a: BS/Bits)
  ∀(b: BS/Bits)
  B/Bool
= λ{
  #E: λ{
    #E: #True{}
    #O: λb.tail #False{}
    #I: λb.tail #False{}
  }
  #O: λ{
    #E: λa.tail #False{}
    #O: λa.tail λb.tail (Base/Bits/eq a.tail b.tail)
    #I: λa.tail λb.tail #False{}
  }
  #I: λ{
    #E: λa.tail #False{}
    #O: λa.tail λb.tail #False{}
    #I: λa.tail λb.tail (Base/Bits/eq a.tail b.tail)
  }
}
\`\`\`

# Base/Parser/Examples/LambdaTerm/parse.agda

\`\`\`agda
module Base.Parser.Examples.LambdaTerm.parse where

open import Base.Function.case
open import Base.Maybe.Maybe
open import Base.Parser.Examples.LambdaTerm.LambdaTerm
open import Base.Parser.Monad.bind
open import Base.Parser.Monad.pure
open import Base.Parser.State
open import Base.Parser.Parser
open import Base.Parser.consume
open import Base.Parser.parse-name
open import Base.Parser.peek-one
open import Base.Parser.skip-trivia
open import Base.String.String

-- Parses a lambda term.
-- = A Parser that produces a Term.
parse : Parser Term
parse = do
  skip-trivia
  one ← peek-one
  case one of λ where
    (Some 'λ') → do
      consume "λ"
      name ← parse-name
      body ← parse
      pure (Lam name body)
    (Some '(') → do
      consume "("
      func ← parse
      argm ← parse
      consume ")"
      pure (App func argm)
    _ → do
      name ← parse-name
      pure (Var name)
\`\`\`

# Base/Parser/Examples/LambdaTerm/parse.kind

\`\`\`kind
...TODO...
\`\`\`

# Main.agda

\`\`\`agda
module Main where

open import Base.ALL

-- Prints "Hello i" repeatedly, where i is an increasing nat.
-- - i: The current iteration number.
-- = An IO action that never terminates.
loop : Nat -> IO Unit
loop i = do
  IO.print ("Hello " <> show i)
  loop (i + 1)

-- The main entry point of the program.
-- = An IO action that starts the infinite loop.
main : IO Unit
main = loop 0
\`\`\`

# Main.kind

\`\`\`kind
...TODO...
\`\`\`

---

Note that, sometimes, a draft will be provided. When that is the case, review it
for errors and oversights that violate the guides, and provide a final version.
Now, generate/update the last file marked as (missing) or (draft). Answer with:

# Path/to/file.xyz

\`\`\`lang
<updated_file_here>
\`\`\`
`.trim();

async function getDeps(file) {
  const ext = path.extname(file);
  let command = '';

  if (ext === '.agda') {
    command = `agda-deps ${file} --recursive`;
  } else if (ext === '.kind') {
    command = `kind-deps ${file} --recursive`;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  try {
    const output = execSync(command, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(x => x !== "");
  } catch (error) {
    console.error(`Error getting dependencies for ${file}:`, error.message);
    return [];
  }
}

async function readFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    return '(missing)';
  }
}

function parseResponse(response) {
  const files = [];
  const lines = response.split('\n');
  let currentFile = null;
  let currentCode = '';
  let inCodeBlock = false;
  let currentLanguage = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentFile) {
        files.push({ path: currentFile, code: currentCode.trim(), language: currentLanguage });
      }
      currentFile = line.slice(2).trim();
      currentCode = '';
      inCodeBlock = false;
    } else if (line.startsWith('```kind')) {
      inCodeBlock = true;
      currentLanguage = 'kind';
    } else if (line.startsWith('```agda')) {
      inCodeBlock = true;
      currentLanguage = 'agda';
    } else if (line.startsWith('```') && inCodeBlock) {
      inCodeBlock = false;
    } else if (inCodeBlock) {
      currentCode += line + '\n';
    }
  }

  if (currentFile) {
    files.push({ path: currentFile, code: currentCode.trim(), language: currentLanguage });
  }

  return files;
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: agda2kind <Path/To/File.[agda|kind]> [<model>]");
    process.exit(1);
  }

  const inputFile = process.argv[2];
  const model = process.argv[3] || 'c'; // Default to Claude if no model is specified

  if (!MODELS[model]) {
    console.log(`Invalid model. Available models: ${Object.keys(MODELS).join(', ')}`);
    process.exit(1);
  }

  const deps = (await getDeps(inputFile)).filter(x => x.slice(0,5) != "Agda/");
  let context = '';
  const missingDeps = [];

  for (const dep of deps) {
    const sourceExt = path.extname(inputFile);
    const targetExt = sourceExt === '.agda' ? '.kind' : '.agda';
    const sourceFile = dep;
    const targetFile = dep.replace(/\.[^.]+$/, targetExt);

    const sourceContent = await readFileContent(sourceFile);
    const targetContent = await readFileContent(targetFile);

    //console.log(dep, !!sourceContent, !!targetContent);

    if (sourceContent === '(missing)') {
      missingDeps.push(sourceFile);
    } else if (targetContent === '(missing)') {
      missingDeps.push(targetFile);
    } else {
      const sourceLanguage = sourceExt === '.agda' ? 'agda' : 'kind';
      const targetLanguage = targetExt === '.agda' ? 'agda' : 'kind';
      context += `# ${sourceFile}\n\n\`\`\`${sourceLanguage}\n${sourceContent}\n\`\`\`\n\n`;
      context += `# ${targetFile}\n\n\`\`\`${targetLanguage}\n${targetContent}\n\`\`\`\n\n`;
    }
  }

  if (missingDeps.length > 0) {
    console.error("ERROR: Missing dependencies. Generate these files first:");
    missingDeps.forEach(dep => console.error(`- ${dep}`));
    process.exit(1);
  }

  const mainFileContent = await readFileContent(inputFile);
  const mainExt = path.extname(inputFile);
  const mainLanguage = mainExt === '.agda' ? 'agda' : 'kind';
  context += `# ${inputFile}\n\n\`\`\`${mainLanguage}\n${mainFileContent}\n\`\`\`\n\n`;

  // Add the corresponding file for the input file as a draft if it exists, otherwise as (missing)
  const otherInputExt = mainExt === '.agda' ? '.kind' : '.agda';
  const otherInputFile = inputFile.replace(/\.[^.]+$/, otherInputExt);
  const otherInputLanguage = otherInputExt === '.agda' ? 'agda' : 'kind';
  const otherInputContent = await readFileContent(otherInputFile);
  
  if (otherInputContent !== '(missing)') {
    context += `# ${otherInputFile} (draft)\n\n\`\`\`${otherInputLanguage}\n${otherInputContent}\n\`\`\`\n\n`;
  } else {
    context += `# ${otherInputFile} (missing)\n\n\`\`\`${otherInputLanguage}\n...\n\`\`\`\n\n`;
  }

  const ask = chat(model);
  const prompt = `${context}\n\nGenerate or update the file marked as (missing) or (draft) now:`;

  // Generate and save the compiled output
  const response = await ask(prompt, { system: SYSTEM_PROMPT, model, system_cacheable: true });
  console.log("\n");

  const files = parseResponse(response);

  for (const file of files) {
    if (path.extname(file.path) === otherInputExt) {
      const dirPath = path.dirname(file.path);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(file.path, file.code);
      console.log(`Saved: ${file.path}`);
    }
  }
  
  // Save the final prompt to a log file
  const logDir = path.join(process.env.HOME || process.env.USERPROFILE, '.ai', 'agda2kind_history');
  await fs.mkdir(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const logFile = path.join(logDir, `${timestamp}_${model}.log`);
  await fs.writeFile(logFile, prompt);
  console.log(`Saved prompt log: ${logFile}`);
}

main().catch(console.error);
