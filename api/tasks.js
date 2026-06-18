import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    // 새로운 기능에 맞춘 새 테이블 생성
    await sql`CREATE TABLE IF NOT EXISTS mpp_schedule (
        id SERIAL PRIMARY KEY,
        subject TEXT,
        lecture TEXT,
        duration INT,
        day INT
    )`;

    if (req.method === 'POST') {
        const { schedule } = req.body;
        
        // 새로 스케줄을 짤 때마다 기존 계획 덮어쓰기 (원치 않으시면 DELETE 줄을 지우면 됩니다)
        await sql`DELETE FROM mpp_schedule`;

        // 계산된 일정 통째로 저장
        for (let s of schedule) {
            await sql`INSERT INTO mpp_schedule (subject, lecture, duration, day) VALUES (${s.subject}, ${s.lecture}, ${s.duration}, ${s.day})`;
        }
        return res.status(200).json({ success: true });
    }
    
    if (req.method === 'GET') {
        // 일차(Day) 순서대로 불러오기
        const data = await sql`SELECT * FROM mpp_schedule ORDER BY day ASC, id ASC`;
        return res.status(200).json(data);
    }
}