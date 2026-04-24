DROP TABLE IF EXISTS habitacao;

CREATE TABLE habitacao
(
    mes_ano        TEXT,
    tipo_venda     TEXT,
    tipo_habitacao TEXT,
    quartos        TEXT,
    distrito       TEXT,
    municipio      TEXT,
    freguesia      TEXT,
    total_rows     INTEGER,
    avg_area       REAL,
    avg_preco      REAL,
    avg_m2         REAL
);

-- Indexing the columns you search by most
CREATE INDEX idx_search_main ON habitacao (mes_ano, municipio, freguesia);