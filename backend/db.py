import contextlib

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

from backend.config import config

_pool: pg_pool.SimpleConnectionPool | None = None


def init_pool(minconn: int = 1, maxconn: int = 10) -> None:
    global _pool
    if _pool is None:
        _pool = pg_pool.SimpleConnectionPool(minconn, maxconn, dsn=config.dsn)


@contextlib.contextmanager
def get_conn():
    if _pool is None:
        init_pool()
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


@contextlib.contextmanager
def get_cursor(dict_cursor: bool = True):
    with get_conn() as conn:
        cursor_factory = psycopg2.extras.RealDictCursor if dict_cursor else None
        cur = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cur
        finally:
            cur.close()
