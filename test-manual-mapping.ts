import { prisma } from './src/lib/db';
import { runAutoMapping } from './scripts/mapping-utils';

async function testManualMapping() {
  const disciplineSlug = 'dota2';
  const teamName = 'Zero Tenacity';

  console.log(`\n--- Testing Manual Mapping for "${teamName}" ---`);
  
  // 1. Reset to auto_mapped state first (to ensure clean test)
  await prisma.teamMapping.update({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } },
    data: { platformId: '858890', status: 'auto_mapped', isManual: false, isLockedFromAutoMapping: false }
  });

  // 2. Change Platform ID (Manual Edit)
  console.log('Performing manual edit...');
  await prisma.teamMapping.update({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } },
    data: { platformId: '123456', status: 'manual_mapped', isManual: true, isLockedFromAutoMapping: true }
  });

  let mapping = await prisma.teamMapping.findUnique({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } }
  });
  console.log(`Status after edit: ${mapping?.status}, PlatformID: ${mapping?.platformId}`);

  // 3. Run auto-map
  console.log('Running auto-mapping...');
  await runAutoMapping(disciplineSlug);

  mapping = await prisma.teamMapping.findUnique({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } }
  });
  console.log(`Status after auto-map: ${mapping?.status}, PlatformID: ${mapping?.platformId}`);
  if (mapping?.platformId === '123456') {
    console.log('SUCCESS: Manual mapping preserved.');
  } else {
    console.log('FAILURE: Manual mapping overwritten!');
  }

  console.log(`\n--- Testing Deletion (Manual Unmap) for "${teamName}" ---`);

  // 4. Delete mapping (Set to manual_unmapped)
  console.log('Performing manual unmap...');
  await prisma.teamMapping.update({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } },
    data: { 
      platformId: null, 
      canonicalName: null, 
      status: 'manual_unmapped', 
      isManual: true, 
      isLockedFromAutoMapping: true 
    }
  });

  mapping = await prisma.teamMapping.findUnique({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } }
  });
  console.log(`Status after unmap: ${mapping?.status}, PlatformID: ${mapping?.platformId}, Locked: ${mapping?.isLockedFromAutoMapping}`);

  // 5. Run auto-map again
  console.log('Running auto-mapping...');
  await runAutoMapping(disciplineSlug);

  mapping = await prisma.teamMapping.findUnique({
    where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamName } }
  });
  console.log(`Status after second auto-map: ${mapping?.status}, PlatformID: ${mapping?.platformId}`);
  if (mapping?.status === 'manual_unmapped' && mapping?.platformId === null) {
    console.log('SUCCESS: Team stayed unmapped.');
  } else {
    console.log('FAILURE: Team re-mapped automatically!');
  }
}

testManualMapping().catch(console.error).finally(() => prisma.$disconnect());
