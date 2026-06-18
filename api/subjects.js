import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function initTables() {
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

    await sql`
        CREATE TABLE IF NOT EXISTS mpp_schedule (
            id SERIAL PRIMARY KEY,
            subject TEXT,
            lecture TEXT,
            duration INT,
            assigned_date TEXT
        )
    `;
}

function extractDateOnly(assignedDate) {
    if (!assignedDate) return '';
    return String(assignedDate).slice(0, 10);
}

function extractLectureNumber(lecture) {
    const match = String(lecture || '').match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

async function migrateScheduleToSubjectsIfEmpty() {
    const existingSubjects = await sql`
        SELECT COUNT(*)::int AS count
        FROM mpp_subject_plans
    `;

    if (existingSubjects[0].count > 0) {
        return;
    }

    const oldSchedule = await sql`
        SELECT subject, lecture, duration, assigned_date
        FROM mpp_schedule
        ORDER BY subject ASC, id ASC
    `;

    if (oldSchedule.length === 0) {
        return;
    }

    const grouped = new Map();

    oldSchedule.forEach(item => {
        const subject = item.subject || '이름 없는 과목';
        const lectureNumber = extractLectureNumber(item.lecture);
        const assignedDate = extractDateOnly(item.assigned_date);

        if (!grouped.has(subject)) {
            grouped.set(subject, {
                subject,
                startLecture: lectureNumber || 1,
                endLecture: lectureNumber || 1,
                startDate: assignedDate,
                endDate: assignedDate,
                lectures: []
            });
        }

        const group = grouped.get(subject);

        if (lectureNumber > 0) {
            group.startLecture = Math.min(group.startLecture, lectureNumber);
            group.endLecture = Math.max(group.endLecture, lectureNumber);
        }

        if (assignedDate) {
            if (!group.startDate || assignedDate < group.startDate) {
                group.startDate = assignedDate;
            }

            if (!group.endDate || assignedDate > group.endDate) {
                group.endDate = assignedDate;
            }
        }

        group.lectures.push({
            lecture: item.lecture,
            lectureNumber: lectureNumber,
            duration: item.duration || 0
        });
    });

    for (const group of grouped.values()) {
        group.lectures.sort((a, b) => {
            return a.lectureNumber - b.lectureNumber;
        });

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
                ${group.subject},
                ${group.startLecture},
                ${group.endLecture},
                ${group.startDate},
                ${group.endDate},
                ${JSON.stringify(group.lectures)}::jsonb
            )
        `;
    }
}

export default async function handler(req, res) {
    try {
        await initTables();

        if (req.method === 'GET') {
            await migrateScheduleToSubjectsIfEmpty();

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
                        lectures = ${JSON.stringify(lectures)}::jsonb
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
                    ${JSON.stringify(lectures)}::jsonb
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