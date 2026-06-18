import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    // 날짜를 글자(TEXT)로 저장하도록 테이블 재생성
    await sql`DROP TABLE IF EXISTS mpp_schedule`; 
    await sql`CREATE TABLE mpp_schedule (
        id SERIAL PRIMARY KEY,
        subject TEXT,
        lecture TEXT,
        duration INT,
        assigned_date TEXT
    )`;

    if (req.method === 'POST') {
        const { schedule } = req.body;
        for (let s of schedule) {
            await sql`INSERT INTO mpp_schedule (subject, lecture, duration, assigned_date) 
                      VALUES (${s.subject}, ${s.lecture}, ${s.duration}, ${s.assigned_date})`;
        }
        return res.status(200).json({ success: true });
    }
    
    if (req.method === 'GET') {
        const data = await sql`SELECT * FROM mpp_schedule ORDER BY assigned_date ASC, id ASC`;
        return res.status(200).json(data);
    }
}