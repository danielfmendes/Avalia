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

app.get('/api/search', async (c) => {
    const level = parseLevel(c.req.query('level'));
    const municipio = c.req.query('municipio');
    const freguesia = c.req.query('freguesia');
    const tipoVenda = c.req.query('tipo_venda');
    const rooms = c.req.query('quartos');

    let sql = 'SELECT * FROM habitacao WHERE 1=1';
    const params: (string | number)[] = [];

    if (level === 'district') {
        sql += ' AND freguesia = ?';
        params.push(MUNI_LEVEL_FLAG);
    } else if (level === 'municipality') {
        if (!municipio) {
            return c.json({success: false, error: 'municipio is required when level=municipality'}, 400);
        }
        sql += ' AND municipio = ? AND freguesia != ?';
        params.push(municipio, MUNI_LEVEL_FLAG);
    } else if (level === 'parish') {
        if (!municipio || !freguesia) {
            return c.json({success: false, error: 'municipio and freguesia are required when level=parish'}, 400);
        }
        sql += ' AND municipio = ? AND freguesia = ?';
        params.push(municipio, freguesia);
    } else {
        // Legacy fallback
        if (municipio) {
            sql += ' AND municipio = ?';
            params.push(municipio);
        }
        if (freguesia) {
            sql += ' AND freguesia = ?';
            params.push(freguesia);
        }
    }

    if (tipoVenda) {
        sql += ' AND tipo_venda = ?';
        params.push(tipoVenda);
    }
    if (rooms) {
        sql += ' AND quartos = ?';
        params.push(rooms);
    }

    // NOTE: This only works correctly if mes_ano is formatted as YYYY-MM
    sql += ' ORDER BY mes_ano ASC';

    try {
        const {results} = await c.env.DB.prepare(sql).bind(...params).all();
        return c.json({
            success: true,
            level: level ?? 'legacy',
            count: results?.length ?? 0,
            data: results ?? [],
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