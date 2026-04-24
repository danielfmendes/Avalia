import {Hono} from 'hono';
import {cors} from 'hono/cors';

type Bindings = {
    DB: D1Database;
    ALLOWED_ORIGIN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const MUNI_LEVEL_FLAG = 'Grouped at Municipio level';

app.use('/api/*', async (c, next) => {
    return cors({
        origin: [
            c.env.ALLOWED_ORIGIN,
            'http://localhost:5173',
            'http://127.0.0.1:3000',
        ],
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: 86400,
    })(c, next);
});

type Level = 'district' | 'municipality' | 'parish';

function parseLevel(raw: string | undefined): Level | null {
    if (raw === 'district' || raw === 'municipality' || raw === 'parish') return raw;
    return null;
}

// The DB stores quartos as numeric strings ('0.0', '1.0', '2.0' …).
// Normalise to the typed format the frontend expects ('T0', 'T1', 'T2' …).
function normalizeRow(r: Record<string, unknown>): Record<string, unknown> {
    const raw = r.quartos as string | null;
    if (raw !== null && raw !== undefined) {
        const n = parseFloat(raw);
        if (!isNaN(n)) {
            return { ...r, quartos: `T${Math.floor(n)}` };
        }
    }
    return r;
}

app.get('/api/search', async (c) => {
    const level = parseLevel(c.req.query('level'));
    const municipio = c.req.query('municipio');
    const freguesia = c.req.query('freguesia');
    const tipoVenda = c.req.query('tipo_venda');
    const rooms = c.req.query('quartos');      // frontend sends 'T2', 'T4+' etc.
    const minArea = c.req.query('min_area');
    const maxArea = c.req.query('max_area');

    // ── District level: special UNION so that municipalities that only have
    //    parish-level rows (e.g. Lisboa) also appear as a synthesised aggregate.
    if (level === 'district') {
        // Lisboa has no pre-aggregated 'Grouped at Municipio level' rows in the DB —
        // all other municipalities do. We synthesise Lisboa's grouped rows on the fly
        // via UNION ALL rather than a correlated subquery (D1 compatibility).
        const districtSql = `
            SELECT * FROM habitacao WHERE freguesia = ?
            UNION ALL
            SELECT
                mes_ano, tipo_venda, tipo_habitacao, quartos,
                distrito, municipio,
                ? AS freguesia,
                SUM(total_rows)                                              AS total_rows,
                CAST(SUM(avg_area  * total_rows) AS REAL) / SUM(total_rows) AS avg_area,
                CAST(SUM(avg_preco * total_rows) AS REAL) / SUM(total_rows) AS avg_preco,
                CAST(SUM(avg_m2    * total_rows) AS REAL) / SUM(total_rows) AS avg_m2
            FROM habitacao
            WHERE municipio = 'Lisboa'
              AND freguesia != ?
            GROUP BY mes_ano, tipo_venda, tipo_habitacao, quartos, distrito, municipio
            ORDER BY mes_ano ASC
        `;
        try {
            const {results} = await c.env.DB.prepare(districtSql)
                .bind(MUNI_LEVEL_FLAG, MUNI_LEVEL_FLAG, MUNI_LEVEL_FLAG)
                .all();
            return c.json({
                success: true,
                level: 'district',
                count: results?.length ?? 0,
                data: (results ?? []).map(r => normalizeRow(r as Record<string, unknown>)),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Database error';
            return c.json({success: false, error: message}, 500);
        }
    }

    // ── Municipality / Parish / Legacy levels ────────────────────────────────
    let sql = 'SELECT * FROM habitacao WHERE 1=1';
    const params: (string | number)[] = [];

    if (level === 'municipality') {
        if (!municipio) {
            return c.json({success: false, error: 'municipio is required when level=municipality'}, 400);
        }
        sql += ' AND municipio = ? COLLATE NOCASE AND freguesia != ?';
        params.push(municipio, MUNI_LEVEL_FLAG);
    } else if (level === 'parish') {
        if (!municipio || !freguesia) {
            return c.json({success: false, error: 'municipio and freguesia are required when level=parish'}, 400);
        }
        sql += ' AND municipio = ? COLLATE NOCASE AND freguesia = ? COLLATE NOCASE';
        params.push(municipio, freguesia);
    } else {
        // Legacy fallback
        if (municipio) {
            sql += ' AND municipio = ? COLLATE NOCASE';
            params.push(municipio);
        }
        if (freguesia) {
            sql += ' AND freguesia = ? COLLATE NOCASE';
            params.push(freguesia);
        }
    }

    if (tipoVenda) {
        sql += ' AND tipo_venda = ?';
        params.push(tipoVenda);
    }

    // quartos in DB is stored as a numeric string ('0.0', '1.0' …).
    // Frontend sends typed strings ('T0', 'T2', 'T4+').
    // Use CAST(quartos AS REAL) for numeric comparisons.
    if (rooms && rooms !== 'T4+') {
        const roomNum = parseInt(rooms.replace(/\D/g, ''), 10);
        if (!isNaN(roomNum)) {
            sql += ' AND CAST(quartos AS REAL) = ?';
            params.push(roomNum);
        }
    } else if (rooms === 'T4+') {
        sql += ' AND CAST(quartos AS REAL) >= 4';
    }

    if (minArea) {
        sql += ' AND avg_area >= ?';
        params.push(parseFloat(minArea));
    }
    if (maxArea) {
        sql += ' AND avg_area <= ?';
        params.push(parseFloat(maxArea));
    }

    sql += ' ORDER BY mes_ano ASC';

    try {
        const {results} = await c.env.DB.prepare(sql).bind(...params).all();
        return c.json({
            success: true,
            level: level ?? 'legacy',
            count: results?.length ?? 0,
            data: (results ?? []).map(r => normalizeRow(r as Record<string, unknown>)),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Database error';
        return c.json({success: false, error: message}, 500);
    }
});

app.get('/api/municipios', async (c) => {
    try {
        const {results} = await c.env.DB.prepare(
            'SELECT DISTINCT municipio FROM habitacao ORDER BY municipio ASC',
        ).all();
        return c.json({success: true, data: results});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Database error';
        return c.json({success: false, error: message}, 500);
    }
});

app.get('/api/freguesias', async (c) => {
    const municipio = c.req.query('municipio');
    if (!municipio) {
        return c.json({success: false, error: 'municipio is required'}, 400);
    }
    try {
        const {results} = await c.env.DB.prepare(
            'SELECT DISTINCT freguesia FROM habitacao WHERE municipio = ? AND freguesia != ? ORDER BY freguesia ASC',
        ).bind(municipio, MUNI_LEVEL_FLAG).all();
        return c.json({success: true, data: results});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Database error';
        return c.json({success: false, error: message}, 500);
    }
});

app.get('/api/health', (c) => c.json({ok: true, service: 'avalia-api'}));

export default app;
