import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function initSubjectTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS mpp_subject_plans (
            id SERIAL PRIMARY KEY,
            subject TEXT NOT NULL,
            start_lecture INT NOT NULL,
            end_lecture INT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            lectures JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
}

export default async function handler(req, res) {
    try {
        await initSubjectTable();

        if (req.method === 'GET') {
            const data = await sql`
                SELECT *
                FROM mpp_subject_plans
                ORDER BY id ASC
            `;

            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const {
                id,
                subject,
                startLecture,
                endLecture,
                startDate,
                endDate,
                lectures
            } = req.body;

            if (
                !subject ||
                !startLecture ||
                !endLecture ||
                !startDate ||
                !endDate ||
                !Array.isArray(lectures)
            ) {
                return res.status(400).json({
                    success: false,
                    error: '과목명, 시작 강, 끝 강, 시작일, 종료일, 강의 시간이 필요합니다.'
                });
            }

            if (id) {
                await sql`
                    UPDATE mpp_subject_plans
                    SET
                        subject = ${subject},
                        start_lecture = ${startLecture},
                        end_lecture = ${endLecture},
                        start_date = ${startDate},
                        end_date = ${endDate},
                        lectures = ${JSON.stringify(lectures)}
                    WHERE id = ${id}
                `;

                return res.status(200).json({
                    success: true,
                    mode: 'updated'
                });
            }

            await sql`
                INSERT INTO mpp_subject_plans (
                    subject,
                    start_lecture,
                    end_lecture,
                    start_date,
                    end_date,
                    lectures
                )
                VALUES (
                    ${subject},
                    ${startLecture},
                    ${endLecture},
                    ${startDate},
                    ${endDate},
                    ${JSON.stringify(lectures)}
                )
            `;

            return res.status(200).json({
                success: true,
                mode: 'created'
            });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: '삭제할 과목 id가 필요합니다.'
                });
            }

            await sql`
                DELETE FROM mpp_subject_plans
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