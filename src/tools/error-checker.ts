import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

/**
 * Error Checking Tools for Kalpana
 * 
 * Provides comprehensive error checking capabilities for various file types:
 * - Syntax validation
 * - TypeScript type checking
 * - ESLint analysis
 * - JSON validation
 * - Package.json validation
 * - Import/export validation
 */

export interface ErrorCheckResult {
  success: boolean;
  errors: ErrorItem[];
  warnings: ErrorItem[];
  fileType: string;
  checkedWith: string[];
}

export interface ErrorItem {
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  source?: string;
}

/**
 * Detect file type based on extension and content
 */
function detectFileType(filePath: string, content: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    case '.py':
      return 'python';
    case '.rs':
      return 'rust';
    case '.go':
      return 'go';
    case '.java':
      return 'java';
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'cpp';
    case '.c':
      return 'c';
    case '.php':
      return 'php';
    case '.rb':
      return 'ruby';
    case '.css':
      return 'css';
    case '.html':
    case '.htm':
      return 'html';
    case '.xml':
      return 'xml';
    case '.yaml':
    case '.yml':
      return 'yaml';
    default:
      // Try to detect based on content
      if (content.includes('#!/usr/bin/env node') || content.includes('#!/usr/bin/node')) {
        return 'javascript';
      }
      if (content.includes('#!/usr/bin/env python') || content.includes('#!/usr/bin/python')) {
        return 'python';
      }
      return 'text';
  }
}

/**
 * Check JSON syntax and structure
 */
function checkJsonSyntax(content: string, filePath: string): ErrorItem[] {
  const errors: ErrorItem[] = [];
  
  try {
    JSON.parse(content);
    
    // Additional checks for package.json
    if (path.basename(filePath) === 'package.json') {
      const pkg = JSON.parse(content);
      
      if (!pkg.name) {
        errors.push({
          message: 'Missing required "name" field in package.json',
          severity: 'error',
          source: 'package-validation'
        });
      }
      
      if (!pkg.version) {
        errors.push({
          message: 'Missing required "version" field in package.json',
          severity: 'error',
          source: 'package-validation'
        });
      }
      
      if (pkg.scripts && typeof pkg.scripts !== 'object') {
        errors.push({
          message: 'Scripts field must be an object',
          severity: 'error',
          source: 'package-validation'
        });
      }
      
      if (pkg.dependencies && typeof pkg.dependencies !== 'object') {
        errors.push({
          message: 'Dependencies field must be an object',
          severity: 'error',
          source: 'package-validation'
        });
      }
    }
    
  } catch (error: any) {
    const match = error.message.match(/at position (\d+)/);
    let line = 1;
    let column = 1;
    
    if (match) {
      const position = parseInt(match[1]);
      const beforeError = content.substring(0, position);
      line = beforeError.split('\n').length;
      column = beforeError.split('\n').pop()?.length || 1;
    }
    
    errors.push({
      line,
      column,
      message: `JSON syntax error: ${error.message}`,
      severity: 'error',
      source: 'json-parser'
    });
  }
  
  return errors;
}

/**
 * Check JavaScript/TypeScript syntax using Node.js syntax checking
 */
async function checkJavaScriptSyntax(content: string, isTypeScript: boolean = false): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  
  try {
    // Basic syntax check using eval (in a safe way)
    if (!isTypeScript) {
      // For JavaScript, we can do a basic syntax check
      new Function(content);
    }
    
    // Check for common syntax issues
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue; // Skip undefined lines
      
      const lineNum = i + 1;
      
      // Check for unmatched brackets
      const openBrackets = (line.match(/[{[(]/g) || []).length;
      const closeBrackets = (line.match(/[}\])]/g) || []).length;
      
      // Check for missing semicolons (basic check)
      if (line.trim().match(/^(let|const|var|function|class|if|for|while|return|throw)\s/) && 
          !line.trim().endsWith(';') && 
          !line.trim().endsWith('{') && 
          !line.trim().endsWith('}')) {
        errors.push({
          line: lineNum,
          message: 'Missing semicolon',
          severity: 'warning',
          source: 'syntax-check'
        });
      }
      
      // Check for undefined variables (basic check)
      const undefinedMatch = line.match(/\bundefined\s*[=!]==?\s*(\w+)/);
      if (undefinedMatch && undefinedMatch[1]) {
        errors.push({
          line: lineNum,
          message: `Potential undefined variable: ${undefinedMatch[1]}`,
          severity: 'warning',
          source: 'syntax-check'
        });
      }
      
      // Check for console statements (warning)
      if (line.includes('console.log') || line.includes('console.error')) {
        errors.push({
          line: lineNum,
          message: 'Console statement found - consider removing for production',
          severity: 'info',
          source: 'best-practices'
        });
      }
    }
    
  } catch (error: any) {
    // Parse syntax error details
    const match = error.message.match(/line (\d+)/);
    const line = match ? parseInt(match[1]) : 1;
    
    errors.push({
      line,
      message: `Syntax error: ${error.message}`,
      severity: 'error',
      source: 'js-parser'
    });
  }
  
  return errors;
}

/**
 * Run TypeScript compiler check
 */
async function runTypeScriptCheck(filePath: string): Promise<ErrorItem[]> {
  return new Promise((resolve) => {
    const errors: ErrorItem[] = [];
    
    // Try to run tsc --noEmit on the file
    const tsc = spawn('npx', ['tsc', '--noEmit', '--skipLibCheck', filePath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    tsc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    tsc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    tsc.on('close', (code) => {
      if (code !== 0 && errorOutput) {
        // Parse TypeScript errors
        const lines = errorOutput.split('\n');
        for (const line of lines) {
          const match = line.match(/(.+):(\d+):(\d+) - error TS(\d+): (.+)/);
          if (match && match[2] && match[3] && match[4] && match[5]) {
            errors.push({
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              message: match[5],
              severity: 'error',
              rule: `TS${match[4]}`,
              source: 'typescript'
            });
          }
        }
      }
      resolve(errors);
    });
    
    tsc.on('error', () => {
      // TypeScript not available, skip
      resolve([]);
    });
  });
}

/**
 * Run ESLint check
 */
async function runESLintCheck(filePath: string): Promise<ErrorItem[]> {
  return new Promise((resolve) => {
    const errors: ErrorItem[] = [];
    
    const eslint = spawn('npx', ['eslint', '--format', 'json', filePath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    
    eslint.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    eslint.on('close', (code) => {
      try {
        if (output.trim()) {
          const results = JSON.parse(output);
          if (results && results[0] && results[0].messages) {
            for (const msg of results[0].messages) {
              errors.push({
                line: msg.line,
                column: msg.column,
                message: msg.message,
                severity: msg.severity === 2 ? 'error' : 'warning',
                rule: msg.ruleId,
                source: 'eslint'
              });
            }
          }
        }
      } catch (e) {
        // ESLint output parsing failed, skip
      }
      resolve(errors);
    });
    
    eslint.on('error', () => {
      // ESLint not available, skip
      resolve([]);
    });
  });
}

/**
 * Check Python syntax and common issues
 */
async function checkPythonSyntax(content: string): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for common Python syntax issues
    if (trimmed.endsWith(':') && !trimmed.match(/^(if|elif|else|for|while|def|class|try|except|finally|with|async def)\b/)) {
      errors.push({
        line: lineNum,
        message: 'Unexpected colon - check syntax',
        severity: 'warning',
        source: 'python-syntax'
      });
    }
    
    // Check for incorrect indentation (basic check)
    if (line.match(/^\s*\t/) && line.match(/^\s* /)) {
      errors.push({
        line: lineNum,
        message: 'Mixed tabs and spaces for indentation',
        severity: 'error',
        source: 'python-syntax'
      });
    }
    
    // Check for common import issues
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      if (trimmed.includes('*') && !trimmed.match(/^from\s+\w+\s+import\s+\*/)) {
        errors.push({
          line: lineNum,
          message: 'Wildcard import should be used carefully',
          severity: 'warning',
          source: 'python-best-practices'
        });
      }
    }
    
    // Check for print statements (Python 2 vs 3)
    if (trimmed.match(/^print\s+[^(]/)) {
      errors.push({
        line: lineNum,
        message: 'Python 2 print statement - use print() function in Python 3',
        severity: 'error',
        source: 'python-version'
      });
    }
    
    // Check for undefined variables (basic check)
    const undefinedMatch = trimmed.match(/\b(\w+)\s*=.*\bundefined\b/);
    if (undefinedMatch) {
      errors.push({
        line: lineNum,
        message: `'undefined' is not defined in Python - use None instead`,
        severity: 'error',
        source: 'python-syntax'
      });
    }
  }
  
  return errors;
}

/**
 * Check PHP syntax and common issues
 */
async function checkPhpSyntax(content: string): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for missing PHP opening tag
    if (i === 0 && !content.startsWith('<?php') && !content.startsWith('<?=')) {
      errors.push({
        line: 1,
        message: 'PHP file should start with <?php tag',
        severity: 'warning',
        source: 'php-syntax'
      });
    }
    
    // Check for missing semicolons
    if (trimmed.length > 0 && 
        !trimmed.startsWith('//') && 
        !trimmed.startsWith('/*') && 
        !trimmed.startsWith('*') && 
        !trimmed.endsWith(';') && 
        !trimmed.endsWith('{') && 
        !trimmed.endsWith('}') && 
        !trimmed.endsWith(':') &&
        !trimmed.match(/^(if|else|elseif|while|for|foreach|switch|case|default|function|class|interface|trait)\b/)) {
      errors.push({
        line: lineNum,
        message: 'Missing semicolon',
        severity: 'error',
        source: 'php-syntax'
      });
    }
    
    // Check for variable naming
    const varMatch = trimmed.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (varMatch) {
      for (const variable of varMatch) {
        if (variable.match(/\$[0-9]/)) {
          errors.push({
            line: lineNum,
            message: `Invalid variable name: ${variable}`,
            severity: 'error',
            source: 'php-syntax'
          });
        }
      }
    }
    
    // Check for deprecated functions (basic list)
    const deprecatedFunctions = ['mysql_connect', 'mysql_query', 'ereg', 'split'];
    for (const func of deprecatedFunctions) {
      if (trimmed.includes(func + '(')) {
        errors.push({
          line: lineNum,
          message: `Deprecated function: ${func}`,
          severity: 'warning',
          source: 'php-deprecated'
        });
      }
    }
  }
  
  return errors;
}

/**
 * Check Go syntax and common issues
 */
async function checkGoSyntax(content: string): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for package declaration
    if (i === 0 && !trimmed.startsWith('package ')) {
      errors.push({
        line: 1,
        message: 'Go files must start with package declaration',
        severity: 'error',
        source: 'go-syntax'
      });
    }
    
    // Check for unused variables (basic pattern)
    const varDeclaration = trimmed.match(/^(\w+)\s*:=\s*.+/);
    if (varDeclaration && varDeclaration[1]) {
      const varName = varDeclaration[1];
      const restOfFile = lines.slice(i + 1).join('\n');
      if (!restOfFile.includes(varName)) {
        errors.push({
          line: lineNum,
          message: `Unused variable: ${varName}`,
          severity: 'warning',
          source: 'go-unused'
        });
      }
    }
    
    // Check for missing error handling
    if (trimmed.includes('err') && !trimmed.includes('if err != nil')) {
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.trim().startsWith('if err != nil')) {
        errors.push({
          line: lineNum,
          message: 'Consider checking error: if err != nil',
          severity: 'info',
          source: 'go-best-practices'
        });
      }
    }
  }
  
  return errors;
}

/**
 * Check Rust syntax and common issues
 */
async function checkRustSyntax(content: string): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for missing semicolons in statements
    if (trimmed.length > 0 && 
        !trimmed.startsWith('//') && 
        !trimmed.startsWith('/*') && 
        !trimmed.endsWith(';') && 
        !trimmed.endsWith('{') && 
        !trimmed.endsWith('}') && 
        !trimmed.endsWith(',') &&
        trimmed.match(/^(let|const|static|fn|struct|enum|impl|use|mod)\b/)) {
      errors.push({
        line: lineNum,
        message: 'Missing semicolon',
        severity: 'error',
        source: 'rust-syntax'
      });
    }
    
    // Check for unused variables
    if (trimmed.startsWith('let ') && !trimmed.includes('_')) {
      const varMatch = trimmed.match(/let\s+(\w+)/);
      if (varMatch && varMatch[1]) {
        const varName = varMatch[1];
        const restOfFile = lines.slice(i + 1).join('\n');
        if (!restOfFile.includes(varName)) {
          errors.push({
            line: lineNum,
            message: `Unused variable: ${varName} (prefix with _ to suppress)`,
            severity: 'warning',
            source: 'rust-unused'
          });
        }
      }
    }
    
    // Check for unwrap() usage
    if (trimmed.includes('.unwrap()')) {
      errors.push({
        line: lineNum,
        message: 'Consider using proper error handling instead of unwrap()',
        severity: 'warning',
        source: 'rust-best-practices'
      });
    }
  }
  
  return errors;
}

/**
 * Check Java syntax and common issues
 */
async function checkJavaSyntax(content: string): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for class naming convention
    const classMatch = trimmed.match(/^public\s+class\s+(\w+)/);
    if (classMatch && classMatch[1]) {
      const className = classMatch[1];
      if (!className.match(/^[A-Z][a-zA-Z0-9]*$/)) {
        errors.push({
          line: lineNum,
          message: `Class name should be PascalCase: ${className}`,
          severity: 'warning',
          source: 'java-naming'
        });
      }
    }
    
    // Check for missing semicolons
    if (trimmed.length > 0 && 
        !trimmed.startsWith('//') && 
        !trimmed.startsWith('/*') && 
        !trimmed.endsWith(';') && 
        !trimmed.endsWith('{') && 
        !trimmed.endsWith('}') && 
        !trimmed.match(/^(if|else|while|for|switch|case|default|public|private|protected|class|interface|enum)\b/)) {
      errors.push({
        line: lineNum,
        message: 'Missing semicolon',
        severity: 'error',
        source: 'java-syntax'
      });
    }
    
    // Check for System.out.println (should use logging)
    if (trimmed.includes('System.out.println')) {
      errors.push({
        line: lineNum,
        message: 'Consider using a logging framework instead of System.out.println',
        severity: 'info',
        source: 'java-best-practices'
      });
    }
  }
  
  return errors;
}

/**
 * Check C/C++ syntax and common issues
 */
async function checkCSyntax(content: string, isCpp: boolean = false): Promise<ErrorItem[]> {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Check for missing semicolons
    if (trimmed.length > 0 && 
        !trimmed.startsWith('//') && 
        !trimmed.startsWith('/*') && 
        !trimmed.startsWith('#') && 
        !trimmed.endsWith(';') && 
        !trimmed.endsWith('{') && 
        !trimmed.endsWith('}') && 
        !trimmed.endsWith(':') &&
        trimmed.match(/^(int|char|float|double|void|bool|string|auto)\s+\w+.*=/)) {
      errors.push({
        line: lineNum,
        message: 'Missing semicolon',
        severity: 'error',
        source: isCpp ? 'cpp-syntax' : 'c-syntax'
      });
    }
    
    // Check for memory leaks (basic check)
    if (trimmed.includes('malloc(') || trimmed.includes('new ')) {
      const hasCorrespondingFree = content.includes('free(') || content.includes('delete ');
      if (!hasCorrespondingFree) {
        errors.push({
          line: lineNum,
          message: 'Memory allocation without corresponding free/delete',
          severity: 'warning',
          source: isCpp ? 'cpp-memory' : 'c-memory'
        });
      }
    }
    
    // Check for printf usage in C++
    if (isCpp && trimmed.includes('printf(')) {
      errors.push({
        line: lineNum,
        message: 'Consider using std::cout instead of printf in C++',
        severity: 'info',
        source: 'cpp-best-practices'
      });
    }
  }
  
  return errors;
}

/**
 * Check imports and exports
 */
function checkImportsExports(content: string, filePath: string): ErrorItem[] {
  const errors: ErrorItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip undefined lines
    
    const lineNum = i + 1;
    
    // Check for relative imports that might be broken
    const importMatch = line.match(/import.*from\s+['"](.+)['"]/);
    if (importMatch && importMatch[1]) {
      const importPath = importMatch[1];
      
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Check if it's a relative import without extension
        if (!path.extname(importPath) && !importPath.endsWith('/')) {
          errors.push({
            line: lineNum,
            message: `Relative import without extension: ${importPath}`,
            severity: 'warning',
            source: 'import-check'
          });
        }
      }
    }
    
    // Check for dynamic imports
    const dynamicImportMatch = line.match(/import\s*\(/);
    if (dynamicImportMatch) {
      errors.push({
        line: lineNum,
        message: 'Dynamic import detected - ensure proper error handling',
        severity: 'info',
        source: 'import-check'
      });
    }
  }
  
  return errors;
}

/**
 * Main error checking function
 */
export async function checkFileErrors(filePath: string): Promise<ErrorCheckResult> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const fileType = detectFileType(filePath, content);
    
    let errors: ErrorItem[] = [];
    let warnings: ErrorItem[] = [];
    const checkedWith: string[] = [];
    
    // Check based on file type
    switch (fileType) {
      case 'json':
        const jsonErrors = checkJsonSyntax(content, filePath);
        errors.push(...jsonErrors.filter(e => e.severity === 'error'));
        warnings.push(...jsonErrors.filter(e => e.severity === 'warning'));
        checkedWith.push('json-parser');
        break;
        
      case 'javascript':
        const jsErrors = await checkJavaScriptSyntax(content, false);
        errors.push(...jsErrors.filter(e => e.severity === 'error'));
        warnings.push(...jsErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('js-syntax');
        
        const jsImportErrors = checkImportsExports(content, filePath);
        warnings.push(...jsImportErrors);
        checkedWith.push('import-check');
        
        // Try ESLint
        const eslintErrors = await runESLintCheck(filePath);
        if (eslintErrors.length > 0) {
          errors.push(...eslintErrors.filter(e => e.severity === 'error'));
          warnings.push(...eslintErrors.filter(e => e.severity !== 'error'));
          checkedWith.push('eslint');
        }
        break;
        
      case 'typescript':
        const tsErrors = await checkJavaScriptSyntax(content, true);
        errors.push(...tsErrors.filter(e => e.severity === 'error'));
        warnings.push(...tsErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('ts-syntax');
        
        const tsImportErrors = checkImportsExports(content, filePath);
        warnings.push(...tsImportErrors);
        checkedWith.push('import-check');
        
        // Try TypeScript compiler
        const tscErrors = await runTypeScriptCheck(filePath);
        if (tscErrors.length > 0) {
          errors.push(...tscErrors);
          checkedWith.push('typescript');
        }
        
        // Try ESLint
        const tsEslintErrors = await runESLintCheck(filePath);
        if (tsEslintErrors.length > 0) {
          errors.push(...tsEslintErrors.filter(e => e.severity === 'error'));
          warnings.push(...tsEslintErrors.filter(e => e.severity !== 'error'));
          checkedWith.push('eslint');
        }
        break;
        
      case 'python':
        const pythonErrors = await checkPythonSyntax(content);
        errors.push(...pythonErrors.filter(e => e.severity === 'error'));
        warnings.push(...pythonErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('python-syntax');
        break;
        
      case 'php':
        const phpErrors = await checkPhpSyntax(content);
        errors.push(...phpErrors.filter(e => e.severity === 'error'));
        warnings.push(...phpErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('php-syntax');
        break;
        
      case 'go':
        const goErrors = await checkGoSyntax(content);
        errors.push(...goErrors.filter(e => e.severity === 'error'));
        warnings.push(...goErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('go-syntax');
        break;
        
      case 'rust':
        const rustErrors = await checkRustSyntax(content);
        errors.push(...rustErrors.filter(e => e.severity === 'error'));
        warnings.push(...rustErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('rust-syntax');
        break;
        
      case 'java':
        const javaErrors = await checkJavaSyntax(content);
        errors.push(...javaErrors.filter(e => e.severity === 'error'));
        warnings.push(...javaErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('java-syntax');
        break;
        
      case 'c':
        const cErrors = await checkCSyntax(content, false);
        errors.push(...cErrors.filter(e => e.severity === 'error'));
        warnings.push(...cErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('c-syntax');
        break;
        
      case 'cpp':
        const cppErrors = await checkCSyntax(content, true);
        errors.push(...cppErrors.filter(e => e.severity === 'error'));
        warnings.push(...cppErrors.filter(e => e.severity !== 'error'));
        checkedWith.push('cpp-syntax');
        break;
        
      default:
        // For other file types, do basic checks
        checkedWith.push('basic-check');
        
        // Check for common issues
        if (content.includes('\r\n')) {
          warnings.push({
            message: 'File contains Windows line endings (CRLF)',
            severity: 'info',
            source: 'line-endings'
          });
        }
        
        if (content.includes('\t')) {
          warnings.push({
            message: 'File contains tab characters',
            severity: 'info',
            source: 'whitespace'
          });
        }
    }
    
    return {
      success: errors.length === 0,
      errors,
      warnings,
      fileType,
      checkedWith
    };
    
  } catch (error: any) {
    return {
      success: false,
      errors: [{
        message: `Failed to read file: ${error.message}`,
        severity: 'error',
        source: 'file-system'
      }],
      warnings: [],
      fileType: 'unknown',
      checkedWith: []
    };
  }
}

/**
 * Check multiple files for errors
 */
export async function checkMultipleFiles(filePaths: string[]): Promise<Record<string, ErrorCheckResult>> {
  const results: Record<string, ErrorCheckResult> = {};
  
  for (const filePath of filePaths) {
    results[filePath] = await checkFileErrors(filePath);
  }
  
  return results;
}

/**
 * Get error summary for a directory
 */
export async function checkDirectoryErrors(dirPath: string, extensions: string[] = ['.ts', '.js', '.json']): Promise<{
  totalFiles: number;
  filesWithErrors: number;
  totalErrors: number;
  totalWarnings: number;
  results: Record<string, ErrorCheckResult>;
}> {
  try {
    const files = await fs.readdir(dirPath, { recursive: true });
    const targetFiles = files
      .filter(file => typeof file === 'string')
      .map(file => path.join(dirPath, file as string))
      .filter(file => extensions.some(ext => file.endsWith(ext)));
    
    const results = await checkMultipleFiles(targetFiles);
    
    const totalFiles = targetFiles.length;
    const filesWithErrors = Object.values(results).filter(r => !r.success).length;
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);
    
    return {
      totalFiles,
      filesWithErrors,
      totalErrors,
      totalWarnings,
      results
    };
    
  } catch (error: any) {
    return {
      totalFiles: 0,
      filesWithErrors: 0,
      totalErrors: 1,
      totalWarnings: 0,
      results: {
        [dirPath]: {
          success: false,
          errors: [{
            message: `Failed to read directory: ${error.message}`,
            severity: 'error',
            source: 'file-system'
          }],
          warnings: [],
          fileType: 'directory',
          checkedWith: []
        }
      }
    };
  }
}
