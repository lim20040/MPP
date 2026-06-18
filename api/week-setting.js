import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function initWeekSettingsTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS mpp_week_settings (
            day_index INT PRIMARY KEY,
            minutes INT NOT NULL DEFAULT 0
        )
    `;

    await sql`
        INSERT INTO mpp_week_settings (day_index, minutes)
        VALUES 
            (0, 0),
            (1, 0),
            (2, 0),
            (3, 0),
            (4, 0),
            (5, 0),
            (6, 0)
        ON CONFLICT (day_index) DO NOTHING
    `;
}

export default async function handler(req, res) {
    try {
        await initWeekSettingsTable();

        if (req.method === 'GET') {
            const data = await sql`
                SELECT day_index, minutes
                FROM mpp_week_settings
                ORDER BY day_index ASC
            `;

            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const { weekSettings } = req.body;

            if (!weekSettings || typeof weekSettings !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'weekSettings object is required'
                });
            }

            for (let i = 0; i < 7; i++) {
                const minutes = parseInt(weekSettings[i]) || 0;

                await sql`
                    INSERT INTO mpp_week_settings (day_index, minutes)
                    VALUES (${i}, ${minutes})
                    ON CONFLICT (day_index)
                    DO UPDATE SET minutes = EXCLUDED.minutes
                `;
            }

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