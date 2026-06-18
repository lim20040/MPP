import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { title, duration } = req.body;
        try {
            await sql`CREATE TABLE IF NOT EXISTS mpp_tasks (id SERIAL PRIMARY KEY, title TEXT, duration INT)`;
            await sql`INSERT INTO mpp_tasks (title, duration) VALUES (${title}, ${duration})`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}