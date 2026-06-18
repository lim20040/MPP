import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function initTables() {
    await sql`
        CREATE TABLE IF NOT EXISTS mpp_schedule (
            id SERIAL PRIMARY KEY,
            subject TEXT,
            lecture TEXT,
            duration INT,
            assigned_date TEXT
        )
    `;

    await sql`
        ALTER TABLE mpp_schedule
        ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT FALSE
    `;
}

export default async function handler(req, res) {
    try {
        await initTables();

        if (req.method === 'GET') {
            const data = await sql`
                SELECT *
                FROM mpp_schedule
                ORDER BY assigned_date ASC, id ASC
            `;

            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const { schedule } = req.body;

            if (!Array.isArray(schedule)) {
                return res.status(400).json({
                    success: false,
                    error: 'schedule must be an array'
                });
            }

            await sql`DELETE FROM mpp_schedule`;

            for (let s of schedule) {
                await sql`
                    INSERT INTO mpp_schedule (
                        subject,
                        lecture,
                        duration,
                        assigned_date,
                        is_done
                    )
                    VALUES (
                        ${s.subject},
                        ${s.lecture},
                        ${s.duration},
                        ${s.assigned_date},
                        ${s.is_done === true}
                    )
                `;
            }

            return res.status(200).json({ success: true });
        }

        if (req.method === 'PATCH') {
            const { id, is_done } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'id is required'
                });
            }

            await sql`
                UPDATE mpp_schedule
                SET is_done = ${is_done === true}
                WHERE id = ${id}
            `;

            return res.status(200).json({
                success: true
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}