import {Hono} from 'hono';
import {cors} from 'hono/cors';

type Bindings = {
    DB: D1Database;
    ALLOWED_ORIGIN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Dynamically use the ALLOWED_ORIGIN from your wrangler.toml / environment
app.use('/api/*', async (c, next) => {
    const corsMiddleware = cors({
        origin: c.env.ALLOWED_ORIGIN || '*',
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: 86400,
    });
    return corsMiddleware(c, next);
});

// The Search Endpoint
app.get('/api/search', async (c) => {
    const municipio = c.req.query('municipio');
    const freguesia = c.req.query('freguesia');
    const tipoVenda = c.req.query('tipo_venda');
    const rooms = c.req.query('quartos');

    let sql = 'SELECT * FROM habitacao WHERE 1=1';
    const params: any[] = [];

    if (municipio) {
        sql += ' AND municipio = ?';
        params.push(municipio);
    }
    if (freguesia) {
        sql += ' AND freguesia = ?';
        params.push(freguesia);
    }
    if (tipoVenda) {
        sql += ' AND tipo_venda = ?';
        params.push(tipoVenda);
    }
    if (rooms) {
        sql += ' AND quartos = ?';
        params.push(rooms);
    }

    // Sort by most recent and limit to keep response fast
    sql += ' ORDER BY mes_ano DESC LIMIT 200';

    try {
        const {results} = await c.env.DB.prepare(sql)
            .bind(...params)
            .all();

        return c.json({
            success: true,
            data: results
        });
    } catch (error: any) {
        return c.json({
            success: false,
            error: error.message || "Database error"
        }, 500);
    }
});

// Helper for frontend dropdowns
app.get('/api/municipios', async (c) => {
    try {
        const {results} = await c.env.DB.prepare(
            'SELECT DISTINCT municipio FROM habitacao ORDER BY municipio ASC'
        ).all();
        return c.json({success: true, data: results});
    } catch (error: any) {
        return c.json({success: false, error: error.message}, 500);
    }
});

export default app;
