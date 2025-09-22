#!/usr/bin/env node

/**
 * Post-build script to fix ESM imports for proper module resolution
 * This script:
 * 1. Converts .ts imports to .js
 * 2. Adds explicit /index.js for directory imports
 * 3. Verifies that all import paths exist
 * 4. Fixes any remaining module resolution issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist');

/**
 * Recursively find all .js files in the dist directory
 */
function findJsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findJsFiles(fullPath));
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Check if a file or directory exists
 */
function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve import path to actual file
 */
function resolveImportPath(importPath, currentFile) {
  const currentDir = path.dirname(currentFile);
  
  // Handle relative imports
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const resolvedPath = path.resolve(currentDir, importPath);
    
    // If it's already a .js file, check if it exists
    if (importPath.endsWith('.js')) {
      return exists(resolvedPath) ? importPath : null;
    }
    
    // Try different extensions and index files
    const candidates = [
      resolvedPath + '.js',
      path.join(resolvedPath, 'index.js')
    ];
    
    for (const candidate of candidates) {
      if (exists(candidate)) {
        // Convert back to relative import, preserving the ./ or ../ prefix
        let relativePath = path.relative(currentDir, candidate);
        relativePath = relativePath.replace(/\\/g, '/');
        
        // Ensure we maintain the relative import prefix
        if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
          relativePath = './' + relativePath;
        }
        
        return relativePath;
      }
    }
    
    // If no .js file exists, assume it should be .js extension
    if (!importPath.endsWith('.js')) {
      return importPath + '.js';
    }
  }
  
  return null;
}

/**
 * Fix imports in a JavaScript file
 */
function fixImportsInFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Regex to match import statements
  const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  
  content = content.replace(importRegex, (match, staticImport, dynamicImport) => {
    const importPath = staticImport || dynamicImport;
    
    // Skip node modules and absolute paths
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
      return match;
    }
    
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      // Verify the path exists
      const resolved = resolveImportPath(importPath, filePath);
      if (!resolved) {
        console.warn(`⚠️  Import not found: ${importPath} in ${filePath}`);
      }
      return match;
    }
    
    // Try to resolve the import
    const resolvedPath = resolveImportPath(importPath, filePath);
    
    if (resolvedPath) {
      console.log(`  ✓ Fixed: ${importPath} → ${resolvedPath}`);
      modified = true;
      return match.replace(importPath, resolvedPath);
    } else {
      console.warn(`  ⚠️  Could not resolve: ${importPath}`);
      return match;
    }
  });
  
  // Additional fixes for common patterns
  
  // Fix .ts extensions that might have been missed (only for relative imports)
  content = content.replace(/from\s+['"](\.[^'"]*?)\.ts['"]/g, (match, p1) => {
    console.log(`  ✓ Fixed .ts extension: ${p1}.ts → ${p1}.js`);
    modified = true;
    return `from "${p1}.js"`;
  });
  
  content = content.replace(/import\s*\(\s*['"](\.[^'"]*?)\.ts['"]\s*\)/g, (match, p1) => {
    console.log(`  ✓ Fixed dynamic .ts import: ${p1}.ts → ${p1}.js`);
    modified = true;
    return `import("${p1}.js")`;
  });
  
  // Fix directory imports (add /index.js) - only if the import doesn't already have an extension
  content = content.replace(/from\s+['"](\.[^'"]*?)['"](?!\.[a-zA-Z])/g, (match, importPath) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    const currentDir = path.dirname(filePath);
    const resolvedDir = path.resolve(currentDir, importPath);
    const indexPath = path.join(resolvedDir, 'index.js');
    
    if (exists(indexPath)) {
      const newImport = importPath + '/index.js';
      console.log(`  ✓ Fixed directory import: ${importPath} → ${newImport}`);
      modified = true;
      return `from "${newImport}"`;
    }
    
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✅ Updated: ${filePath}`);
  }
}

/**
 * Verify all imports in the dist directory
 */
function verifyImports() {
  console.log('\n🔍 Verifying all imports...');
  
  const jsFiles = findJsFiles(DIST_DIR);
  let totalErrors = 0;
  
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      
      // Only check relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const currentDir = path.dirname(file);
        const resolvedPath = path.resolve(currentDir, importPath);
        
        if (!exists(resolvedPath)) {
          console.error(`❌ Missing import: ${importPath} in ${file}`);
          totalErrors++;
        }
      }
    }
  }
  
  if (totalErrors === 0) {
    console.log('✅ All imports verified successfully!');
  } else {
    console.error(`❌ Found ${totalErrors} import errors`);
    process.exit(1);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Fixing ESM imports in dist directory...\n');
  
  if (!exists(DIST_DIR)) {
    console.error(`❌ Dist directory not found: ${DIST_DIR}`);
    process.exit(1);
  }
  
  const jsFiles = findJsFiles(DIST_DIR);
  console.log(`Found ${jsFiles.length} JavaScript files to process\n`);
  
  // Fix imports in all files
  for (const file of jsFiles) {
    fixImportsInFile(file);
  }
  
  console.log('\n✅ Import fixing completed!');
  
  // Verify all imports work
  verifyImports();
  
  console.log('\n🎉 All imports fixed and verified!');
}

// Run the script
main();
