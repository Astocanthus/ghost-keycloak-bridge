import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'ghost-db',
    user: process.env.DB_USER || 'ghost',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'ghost',
    port: parseInt(process.env.DB_PORT || '3306')
});

export const query = async (sql, params) => {
    const [results] = await pool.execute(sql, params);
    return results;
};

export const fetchGhostSecret = async () => {
    const rows = await query("SELECT value FROM settings WHERE `key` = 'db_hash'");
    return rows.length > 0 ? rows[0].value : null;
};

// Vérifie si la table users est vide ou sans admin actif
export const isStaffEmpty = async () => {
    const rows = await query("SELECT count(*) as count FROM users WHERE status = 'active'");
    return rows[0].count === 0;
};