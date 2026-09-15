const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Running postinstall script...');

// 1. Generate Prisma Client
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client generated successfully');
} catch (err) {
  console.error('❌ Failed to generate Prisma Client:', err.message);
}

// 2. Create symlinks for Linux deployment
const linuxEngine = findLinuxEngine();
if (linuxEngine) {
  const targets = [
    'node_modules/.prisma/client/query_engine-windows.dll.node',
    'src/generated/client/query_engine-windows.dll.node',
    '.next/standalone/prisma/query_engine-windows.dll.node',
  ];
  
  targets.forEach(target => {
    const fullPath = path.join(process.cwd(), target);
    const dir = path.dirname(fullPath);
    if (fs.existsSync(dir)) {
      try {
        fs.copyFileSync(linuxEngine, fullPath);
        console.log(`✅ Copied to: ${target}`);
      } catch (e) {
        console.log(`⚠️ Skipped: ${target}`);
      }
    }
  });
}

function findLinuxEngine() {
  const searchPaths = [
    'node_modules/@prisma/engines',
    'node_modules/prisma',
  ];
  
  for (const searchPath of searchPaths) {
    const fullDir = path.join(process.cwd(), searchPath);
    if (fs.existsSync(fullDir)) {
      const files = fs.readdirSync(fullDir);
      const engine = files.find(f => f.includes('debian-openssl') && f.endsWith('.so.node'));
      if (engine) {
        return path.join(fullDir, engine);
      }
    }
  }
  return null;
}