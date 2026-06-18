import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    // 안전하게 테이블을 초기화 및 재생성합니다.
    await sql`CREATE TABLE IF NOT EXISTS mpp_schedule (
        id SERIAL PRIMARY KEY,
        subject TEXT,
        lecture TEXT,
        duration INT,
        assigned_date TEXT
    )`;

    if (req.method === 'POST') {
        const { schedule } = req.body;
        
        // 새로운 연산을 실행하므로 기존 계획은 완전히 초기화
        await sql`DELETE FROM mpp_schedule`;

        // 계산된 똑똑한 다과목 분배 스케줄을 차례대로 밀어넣기
        for (let s of schedule) {
            await sql`INSERT INTO mpp_schedule (subject, lecture, duration, assigned_date) 
                      VALUES (${s.subject}, ${s.lecture}, ${s.duration}, ${s.assigned_date})`;
        }
        return res.status(200).json({ success: true });
    }
    
    if (req.method === 'GET') {
        // 날짜 알파벳/숫자 순 정렬 및 입력된 순 정렬
        const data = await sql`SELECT * FROM mpp_schedule ORDER BY assigned_date ASC, id ASC`;
        return res.status(200).json(data);
    }
}