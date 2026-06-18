import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    await sql`
        CREATE TABLE IF NOT EXISTS mpp_schedule (
            id SERIAL PRIMARY KEY,
            subject TEXT,
            lecture TEXT,
            duration INT,
            assigned_date TEXT
        )
    `;

    if (req.method === 'POST') {
        const { schedule } = req.body;

        await sql`DELETE FROM mpp_schedule`;

        for (let s of schedule) {
            await sql`
                INSERT INTO mpp_schedule (subject, lecture, duration, assigned_date)
                VALUES (${s.subject}, ${s.lecture}, ${s.duration}, ${s.assigned_date})
            `;
        }

        return res.status(200).json({ success: true });
    }

    if (req.method === 'GET') {
        const data = await sql`
            SELECT *
            FROM mpp_schedule
            ORDER BY assigned_date ASC, id ASC
        `;

        return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}