import { VILLAGES } from '../src/data/villages';
import { VILLAGE_DISTANCES_KM } from '../src/data/fares';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function runDistanceCheck() {
  console.log('========================================================================================');
  console.log('                          VILLAGE COORDINATES INTEGRITY CHECK                           ');
  console.log('========================================================================================');

  const coordMap = new Map<string, string>();
  const coordIssues: string[] = [];

  // Sharqia / Zagazig bounding box approx: lat [30.3, 30.8], lng [31.3, 31.8]
  VILLAGES.forEach((v) => {
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number') {
      coordIssues.push(`[MISSING COORDS] ${v.name} has no lat/lng coordinates.`);
      return;
    }
    const key = `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
    if (coordMap.has(key)) {
      coordIssues.push(`[DUPLICATE] ${v.name} has identical coordinates to ${coordMap.get(key)} (${key})`);
    } else {
      coordMap.set(key, v.name);
    }

    if (v.lat < 30.2 || v.lat > 31.0 || v.lng < 31.2 || v.lng > 32.0) {
      coordIssues.push(`[OUT OF BOUNDS] ${v.name} coordinates (${v.lat}, ${v.lng}) appear outside Sharqia.`);
    }
  });

  if (coordIssues.length === 0) {
    console.log('✓ All 10 villages have distinct coordinates within the Sharqia/Zagazig coverage area.');
  } else {
    coordIssues.forEach((issue) => console.log('⚠️ ' + issue));
  }

  console.log('\n========================================================================================');
  console.log('                     DISTANCE COMPARISON TABLE: TABLE vs STRAIGHT-LINE                  ');
  console.log('========================================================================================');
  console.log(
    'Village A'.padEnd(24) +
      ' | ' +
      'Village B'.padEnd(24) +
      ' | Table km | Straight km | Ratio | Flag'
  );
  console.log('-'.repeat(96));

  const rows: Array<{
    vA: string;
    vB: string;
    tableKm: number;
    straightKm: number;
    ratio: number;
    flag: string;
  }> = [];

  for (let i = 0; i < VILLAGES.length; i++) {
    for (let j = i + 1; j < VILLAGES.length; j++) {
      const vA = VILLAGES[i];
      const vB = VILLAGES[j];

      const tableDist = VILLAGE_DISTANCES_KM[vA.name]?.[vB.name];
      if (typeof tableDist !== 'number') {
        rows.push({
          vA: vA.name,
          vB: vB.name,
          tableKm: -1,
          straightKm: 0,
          ratio: 0,
          flag: 'MISSING IN TABLE',
        });
        continue;
      }

      if (
        typeof vA.lat !== 'number' ||
        typeof vA.lng !== 'number' ||
        typeof vB.lat !== 'number' ||
        typeof vB.lng !== 'number'
      ) {
        continue;
      }

      const straightDist = haversineKm(vA.lat, vA.lng, vB.lat, vB.lng);
      const ratio = straightDist > 0 ? Number((tableDist / straightDist).toFixed(2)) : 1.0;

      let flag = 'OK';
      if (tableDist < straightDist) {
        flag = 'IMPOSSIBLE (Table < Straight)';
      } else if (ratio > 2.0) {
        flag = 'SUSPICIOUS (High > 2.0)';
      } else if (straightDist > 3.0 && ratio < 1.05) {
        flag = 'SUSPICIOUS (Low < 1.05)';
      }

      rows.push({
        vA: vA.name,
        vB: vB.name,
        tableKm: tableDist,
        straightKm: straightDist,
        ratio,
        flag,
      });
    }
  }

  rows.forEach((r) => {
    console.log(
      r.vA.padEnd(24) +
        ' | ' +
        r.vB.padEnd(24) +
        ' | ' +
        String(r.tableKm.toFixed(1)).padStart(8) +
        ' | ' +
        String(r.straightKm.toFixed(2)).padStart(11) +
        ' | ' +
        String(r.ratio.toFixed(2)).padStart(5) +
        ' | ' +
        r.flag
    );
  });

  const impossibleCount = rows.filter((r) => r.flag.includes('IMPOSSIBLE')).length;
  const suspiciousCount = rows.filter((r) => r.flag.includes('SUSPICIOUS')).length;
  const okCount = rows.filter((r) => r.flag === 'OK').length;

  console.log('\n========================================================================================');
  console.log(`SUMMARY: Total Pairs: ${rows.length} | OK: ${okCount} | Suspicious: ${suspiciousCount} | Impossible: ${impossibleCount}`);
  console.log('========================================================================================');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDistanceCheck();
}
