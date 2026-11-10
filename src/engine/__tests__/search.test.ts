import { describe, expect, it } from 'vitest';
import { delhi } from '../../data';
import { createSearch, levenshtein, normalise } from '../search';

const { search, unavailableCity } = createSearch(delhi);
const top = (q: string) => search(q)[0];
const ids = (q: string) => search(q).map((r) => r.station.id);

describe('helpers', () => {
  it('normalises punctuation and case', () => {
    expect(normalise('R.K. Puram')).toBe('r k puram');
    expect(normalise('  Mayur   Vihar-I ')).toBe('mayur vihar i');
  });

  it('computes Levenshtein distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('early-exits beyond the cap', () => {
    expect(levenshtein('a', 'abcdefghij', 2)).toBeGreaterThan(2);
  });
});

describe('station name search', () => {
  it('finds an exact station name', () => {
    expect(top('Rajiv Chowk').station.id).toBe('rajiv-chowk');
  });

  it('is case insensitive', () => {
    expect(top('rAjIv ChOwK').station.id).toBe('rajiv-chowk');
  });

  it('matches on a prefix', () => {
    expect(ids('kashmere')).toContain('kashmere-gate');
  });

  it('matches on word prefixes across a multi-word query', () => {
    expect(ids('noida sec 18')).toContain('noida-sector-18');
  });

  it('tolerates typos', () => {
    expect(ids('rajiv chwok')).toContain('rajiv-chowk');
    expect(ids('kashmir gate')).toContain('kashmere-gate');
  });

  it('returns nothing for an empty query', () => {
    expect(search('')).toHaveLength(0);
    expect(search('   ')).toHaveLength(0);
  });

  it('returns at most the requested number of results', () => {
    expect(search('a', 5).length).toBeLessThanOrEqual(5);
  });

  it('never returns the same station twice', () => {
    const results = search('noida', 20).map((r) => r.station.id);
    expect(new Set(results).size).toBe(results.length);
  });
});

describe('aliases and renamed stations', () => {
  it('resolves the old HUDA City Centre name', () => {
    expect(ids('HUDA City Centre')).toContain('millennium-city-centre-gurugram');
  });

  it('resolves Pragati Maidan to Supreme Court', () => {
    expect(ids('Pragati Maidan')).toContain('supreme-court');
  });

  it('resolves Connaught Place to Rajiv Chowk', () => {
    expect(top('Connaught Place').station.id).toBe('rajiv-chowk');
  });

  it('resolves the CP abbreviation', () => {
    expect(ids('CP')).toContain('rajiv-chowk');
  });
});

describe('airport codes', () => {
  it('resolves the DEL IATA code to an airport station', () => {
    const hit = top('DEL');
    expect(['igi-airport-terminal-3', 'terminal-1-igi-airport']).toContain(hit.station.id);
  });

  it('resolves the VIDP ICAO code', () => {
    const hit = top('VIDP');
    expect(['igi-airport-terminal-3', 'terminal-1-igi-airport']).toContain(hit.station.id);
  });

  it('resolves Terminal 1 to the Magenta Line station', () => {
    expect(ids('Terminal 1')).toContain('terminal-1-igi-airport');
  });

  it('resolves Terminal 3 to the Airport Express station', () => {
    expect(ids('Terminal 3')).toContain('igi-airport-terminal-3');
  });

  it('resolves Aerocity', () => {
    expect(ids('Aerocity')).toContain('delhi-aerocity');
  });
});

describe('landmarks', () => {
  it('resolves Red Fort to Lal Qila', () => {
    expect(ids('Red Fort')).toContain('lal-qila');
  });

  it('resolves the Lotus Temple to Kalkaji Mandir', () => {
    expect(ids('Lotus Temple')).toContain('kalkaji-mandir');
  });

  it('resolves New Delhi Railway Station', () => {
    expect(ids('New Delhi Railway Station')).toContain('new-delhi');
  });

  it('resolves DLF Cyber City', () => {
    expect(ids('DLF Cyber City')).toContain('cyber-city');
  });
});

describe('cities that are not in this data build', () => {
  it('flags BOM rather than inventing a route', () => {
    const hit = unavailableCity('BOM');
    expect(hit).not.toBeNull();
    expect(hit!.city).toBe('Mumbai');
  });

  it('flags MAA rather than inventing a route', () => {
    const hit = unavailableCity('MAA');
    expect(hit).not.toBeNull();
    expect(hit!.city).toBe('Chennai');
  });

  it('does not flag DEL, which is in the dataset', () => {
    expect(unavailableCity('DEL')).toBeNull();
  });

  it('returns no station results for an out-of-network airport code', () => {
    const results = search('BOM').filter((r) => r.kind === 'airport');
    expect(results).toHaveLength(0);
  });
});
