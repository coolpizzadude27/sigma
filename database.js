const { Pool } = require('pg');

// PostgreSQL connection (Replace with your Render database URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Use an environment variable for security
    ssl: { rejectUnauthorized: false } // Required for Render
});

// Initialize table for role tracking
async function initializeDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS role_data (
            user_id TEXT PRIMARY KEY,
            minor BOOLEAN DEFAULT FALSE,
            adult BOOLEAN DEFAULT FALSE
        )
    `);
}

// Get user roles
async function getUserRoles(userId) {
    const res = await pool.query('SELECT * FROM role_data WHERE user_id = $1', [userId]);
    return res.rows[0] || { minor: false, adult: false };
}

// Update user roles
async function updateUserRoles(userId, minor, adult) {
    await pool.query(`
        INSERT INTO role_data (user_id, minor, adult)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET minor = EXCLUDED.minor, adult = EXCLUDED.adult
    `, [userId, minor, adult]);
}

module.exports = { initializeDB, getUserRoles, updateUserRoles };
