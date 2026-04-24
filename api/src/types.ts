// api/src/types.ts
export interface Env {
    // Your D1 Database binding
    DB: D1Database;

    // Your dynamic CORS origin variable
    ALLOWED_ORIGIN: string;
}