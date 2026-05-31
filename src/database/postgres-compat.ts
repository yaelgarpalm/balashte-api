import { DataSource } from 'typeorm';

type QueryResult = any[] & { insertId?: number; affectedRows?: number };

function isPostgresDataSource(target: any) {
  const dataSource = target instanceof DataSource ? target : target?.connection || target?.manager?.connection;
  return dataSource?.options?.type === 'postgres';
}

function replaceQuestionPlaceholders(sql: string) {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let result = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      result += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      result += char;
      if (char === '*' && next === '/') {
        result += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      result += char + next;
      i += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '/' && next === '*') {
      result += char + next;
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'" && sql[i - 1] !== '\\') {
      inSingleQuote = !inSingleQuote;
      result += char;
      continue;
    }

    if (!inSingleQuote && char === '"' && sql[i - 1] !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '?') {
      index += 1;
      result += `$${index}`;
      continue;
    }

    result += char;
  }

  return result;
}

function normalizePostgresSql(sql: string) {
  let normalized = replaceQuestionPlaceholders(sql);

  normalized = normalized.replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE');
  normalized = normalized.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');
  normalized = normalized.replace(/\bDATE_ADD\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "(CURRENT_DATE + INTERVAL '$1 day')");
  normalized = normalized.replace(/\bDATE_SUB\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '$1 day')");
  normalized = normalized.replace(/\bDATEDIFF\(\s*([^,]+?)\s*,\s*CURRENT_DATE\s*\)/gi, '($1::date - CURRENT_DATE)');
  normalized = normalized.replace(/\bMONTH\(([^)]+)\)/gi, "EXTRACT(MONTH FROM $1)");
  normalized = normalized.replace(/\bYEAR\(([^)]+)\)/gi, "EXTRACT(YEAR FROM $1)");

  normalized = normalized.replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');

  normalized = normalized.replace(
    /INSERT\s+INTO\s+configuracion\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE\s+valor\s*=\s*(\$\d+)/i,
    'INSERT INTO configuracion ($1) VALUES ($2) ON CONFLICT (clave) DO UPDATE SET valor = $3',
  );

  if (/^\s*INSERT\s+INTO\s+/i.test(normalized) && !/\bRETURNING\b/i.test(normalized)) {
    normalized = `${normalized.trim().replace(/;$/, '')} RETURNING id`;
  }

  if (/^\s*(UPDATE|DELETE)\s+/i.test(normalized) && !/\bRETURNING\b/i.test(normalized)) {
    normalized = `${normalized.trim().replace(/;$/, '')} RETURNING id`;
  }

  if (/^\s*INSERT\s+INTO\s+/i.test(normalized) && /\bON\s+CONFLICT\b/i.test(normalized) && !/\bDO\s+NOTHING\b/i.test(normalized)) {
    return normalized;
  }

  if (/^\s*INSERT\s+INTO\s+/i.test(normalized) && /\bbeneficios_asignados\b/i.test(normalized) && !/\bON\s+CONFLICT\b/i.test(normalized)) {
    normalized = normalized.replace(/\s+RETURNING\s+id\s*$/i, ' ON CONFLICT DO NOTHING RETURNING id');
  }

  return normalized;
}

function decorateResult(rows: any[], sql: string): QueryResult {
  const result = rows as QueryResult;

  if (/^\s*INSERT\s+INTO\s+/i.test(sql)) {
    result.insertId = rows[0]?.id ?? 0;
    result.affectedRows = rows.length;
  } else if (/^\s*(UPDATE|DELETE)\s+/i.test(sql)) {
    result.affectedRows = rows.length;
  }

  return result;
}

export function installPostgresCompat() {
  const dataSourceProto = DataSource.prototype as any;
  if (dataSourceProto.__orchidPostgresCompatInstalled) return;
  dataSourceProto.__orchidPostgresCompatInstalled = true;

  const originalDataSourceQuery = dataSourceProto.query;
  dataSourceProto.query = async function patchedDataSourceQuery(query: string, parameters?: any[], queryRunner?: any) {
    if (!isPostgresDataSource(this)) return originalDataSourceQuery.call(this, query, parameters, queryRunner);
    const normalized = normalizePostgresSql(query);
    const rows = await originalDataSourceQuery.call(this, normalized, parameters, queryRunner);
    return decorateResult(rows, normalized);
  };

  const originalCreateQueryRunner = dataSourceProto.createQueryRunner;
  dataSourceProto.createQueryRunner = function patchedCreateQueryRunner(...args: any[]) {
    const queryRunner = originalCreateQueryRunner.apply(this, args);
    if (!isPostgresDataSource(this) || queryRunner.__orchidPostgresCompatInstalled) return queryRunner;

    queryRunner.__orchidPostgresCompatInstalled = true;
    const originalQueryRunnerQuery = queryRunner.query.bind(queryRunner);
    queryRunner.query = async (query: string, parameters?: any[], useStructuredResult?: boolean) => {
      const normalized = normalizePostgresSql(query);
      const rows = await originalQueryRunnerQuery(normalized, parameters, useStructuredResult);
      return decorateResult(rows, normalized);
    };

    return queryRunner;
  };
}
