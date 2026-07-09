let subjectPlans = [];
let loadedScheduleData = [];
let calendarCurrentDate = new Date();
let weekSettingsCache = {};

window.onload = async () => {
    const today = new Date().toISOString().split('T')[0];

    if (document.getElementById('bulkStartDate')) {
        document.getElementById('bulkStartDate').value = today;
        document.getElementById('bulkEndDate').value = today;

        const savedRate = localStorage.getItem('mpp_time_reduction_rate');

        if (savedRate && document.getElementById('timeReductionRate')) {
            document.getElementById('timeReductionRate').value = savedRate;
        }

        const rateInput = document.getElementById('timeReductionRate');

        if (rateInput) {
            rateInput.addEventListener('change', () => {
                localStorage.setItem('mpp_time_reduction_rate', rateInput.value);
                updatePlannedDurationPreview();
            });
        }

        await loadWeekSettingsFromDB();
        await loadSubjectPlans();
    }

    if (document.getElementById('scheduleResult')) {
        await loadSchedule();
        await checkOverdueAndOfferReschedule();
    }
};

// --- 공통 날짜 함수 ---
function parseLocalDate(dateString) {
    const [y, m, d] = String(dateString).split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayKey() {
    return formatDateKey(new Date());
}

function addDays(date, days) {
    const copied = new Date(date);
    copied.setDate(copied.getDate() + days);
    return copied;
}

function getDateRange(startDate, endDate) {
    const dates = [];
    let current = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    while (current <= end) {
        dates.push(formatDateKey(current));
        current = addDays(current, 1);
    }

    return dates;
}

function getDayIndex(dateKey) {
    return parseLocalDate(dateKey).getDay();
}

function getDayName(dateKey) {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return dayNames[getDayIndex(dateKey)];
}

function extractDateOnly(assignedDate) {
    return String(assignedDate || '').slice(0, 10);
}

function makeLectureKey(subject, lecture) {
    return `${subject}__${lecture}`;
}

// --- 요일별 설정 DB 저장/불러오기 ---
async function saveWeekSettingsToDB() {
    const weekSettings = {};

    for (let i = 0; i < 7; i++) {
        const input = document.getElementById(`time-${i}`);
        const value = parseInt(input.value) || 0;

        if (value < 0) {
            return alert("요일별 가능 시간은 0분 이상이어야 합니다.");
        }

        weekSettings[i] = value;
    }

    try {
        const res = await fetch('/api/week-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ weekSettings })
        });

        const result = await res.json();

        if (!res.ok) {
            alert(`요일별 시간 저장 실패: ${result.error || '알 수 없는 오류'}`);
            return;
        }

        weekSettingsCache = weekSettings;
        alert("요일별 가능 시간이 저장되었습니다.");

    } catch (error) {
        console.error(error);
        alert("요일별 가능 시간 저장 중 오류가 발생했습니다.");
    }
}

async function loadWeekSettingsFromDB() {
    try {
        const res = await fetch('/api/week-settings');

        if (!res.ok) {
            console.error("요일별 시간 불러오기 실패");
            return {};
        }

        const data = await res.json();
        const settings = {};

        data.forEach(item => {
            settings[item.day_index] = item.minutes;

            const input = document.getElementById(`time-${item.day_index}`);

            if (input) {
                input.value = item.minutes;
            }
        });

        weekSettingsCache = settings;
        return settings;

    } catch (error) {
        console.error("요일별 시간 불러오기 오류:", error);
        return {};
    }
}

// --- 스케줄 반영률 ---
function getReductionRate() {
    const input = document.getElementById('timeReductionRate');

    if (!input) return 80;

    const rate = parseInt(input.value);

    if (isNaN(rate) || rate <= 0) {
        return 80;
    }

    return Math.min(Math.max(rate, 50), 100);
}

function calculatePlannedDuration(originalDuration) {
    const rate = getReductionRate();
    return Math.max(1, Math.ceil(originalDuration * rate / 100));
}

// --- 과목 저장소 불러오기 ---
async function loadSubjectPlans() {
    try {
        const res = await fetch('/api/subjects');
        const data = await res.json();

        subjectPlans = data.map(plan => {
            let lectures = plan.lectures;

            if (typeof lectures === 'string') {
                try {
                    lectures = JSON.parse(lectures);
                } catch {
                    lectures = [];
                }
            }

            return {
                ...plan,
                lectures
            };
        });

        renderSubjectPlans();

    } catch (error) {
        console.error(error);

        const box = document.getElementById('subjectPlanList');

        if (box) {
            box.innerHTML = "저장된 과목을 불러오는 중 오류가 발생했습니다.";
        }
    }
}

// --- 강의 시간 입력칸 펼치기 ---
function expandSubjectInputs() {
    const subject = document.getElementById('bulkSubject').value.trim();
    const start = parseInt(document.getElementById('bulkStart').value);
    const end = parseInt(document.getElementById('bulkEnd').value);
    const startDate = document.getElementById('bulkStartDate').value;
    const endDate = document.getElementById('bulkEndDate').value;

    if (!subject || isNaN(start) || isNaN(end) || !startDate || !endDate) {
        return alert("과목명, 시작 강, 끝 강, 시작일, 종료일을 모두 입력해주세요.");
    }

    if (start <= 0 || end <= 0) {
        return alert("시작 강과 끝 강은 1 이상이어야 합니다.");
    }

    if (start > end) {
        return alert("시작 강은 끝 강보다 클 수 없습니다.");
    }

    if (startDate > endDate) {
        return alert("시작일은 종료일보다 늦을 수 없습니다.");
    }

    const rate = getReductionRate();

    let html = `
        <div class="bulk-expanded-subject">
            <div class="bulk-expanded-title">
                ${subject} ｜ ${start}강 ~ ${end}강 ｜ ${startDate} ~ ${endDate}
            </div>

            <div class="duration-guide">
                원래 강의 시간을 입력하세요. 스케줄에는 자동으로 ${rate}%만 반영됩니다.
                예: 60분 입력 → ${Math.ceil(60 * rate / 100)}분으로 배치
            </div>

            <div class="bulk-lecture-grid">
    `;

    for (let i = start; i <= end; i++) {
        html += `
            <div class="bulk-lecture-item duration-input-item">
                <span>${i}강</span>
                <input type="number" id="dur_${i}" placeholder="원래 분" oninput="updateSinglePlannedPreview(${i})">
                <small id="planned_${i}">반영: -</small>
            </div>
        `;
    }

    html += `
            </div>
        </div>
    `;

    const area = document.getElementById('bulkExpandedArea');
    area.innerHTML = html;
    area.style.display = 'block';

    document.getElementById('btnSaveSubject').style.display = 'block';
}

function updateSinglePlannedPreview(lectureNumber) {
    const input = document.getElementById(`dur_${lectureNumber}`);
    const preview = document.getElementById(`planned_${lectureNumber}`);

    if (!input || !preview) return;

    const originalDuration = parseInt(input.value);

    if (isNaN(originalDuration) || originalDuration <= 0) {
        preview.innerText = "반영: -";
        return;
    }

    const plannedDuration = calculatePlannedDuration(originalDuration);
    preview.innerText = `반영: ${plannedDuration}분`;
}

function updatePlannedDurationPreview() {
    const start = parseInt(document.getElementById('bulkStart')?.value);
    const end = parseInt(document.getElementById('bulkEnd')?.value);

    if (isNaN(start) || isNaN(end)) return;

    for (let i = start; i <= end; i++) {
        updateSinglePlannedPreview(i);
    }
}

// --- 과목 저장 ---
async function saveSubjectPlan() {
    const editingId = document.getElementById('editingSubjectId').value;
    const subject = document.getElementById('bulkSubject').value.trim();
    const startLecture = parseInt(document.getElementById('bulkStart').value);
    const endLecture = parseInt(document.getElementById('bulkEnd').value);
    const startDate = document.getElementById('bulkStartDate').value;
    const endDate = document.getElementById('bulkEndDate').value;
    const reductionRate = getReductionRate();

    localStorage.setItem('mpp_time_reduction_rate', reductionRate);

    if (!subject || isNaN(startLecture) || isNaN(endLecture) || !startDate || !endDate) {
        return alert("과목 정보를 먼저 입력해주세요.");
    }

    const lectures = [];

    for (let i = startLecture; i <= endLecture; i++) {
        const input = document.getElementById(`dur_${i}`);

        if (!input) {
            return alert("먼저 강의별 시간 입력칸을 펼쳐주세요.");
        }

        const originalDuration = parseInt(input.value);

        if (isNaN(originalDuration) || originalDuration <= 0) {
            return alert(`${i}강의 원래 시간을 정확히 입력해주세요.`);
        }

        const plannedDuration = calculatePlannedDuration(originalDuration);

        lectures.push({
            lecture: `${i}강`,
            lectureNumber: i,
            originalDuration,
            duration: plannedDuration,
            reductionRate
        });
    }

    try {
        const res = await fetch('/api/subjects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: editingId || null,
                subject,
                startLecture,
                endLecture,
                startDate,
                endDate,
                lectures
            })
        });

        const result = await res.json();

        if (!res.ok) {
            alert(`과목 저장 실패: ${result.error || '알 수 없는 오류'}`);
            return;
        }

        alert(editingId ? "과목이 수정되었습니다." : "과목이 저장되었습니다.");

        resetSubjectForm();
        await loadSubjectPlans();

    } catch (error) {
        console.error(error);
        alert("과목 저장 중 오류가 발생했습니다.");
    }
}

// --- 저장된 과목 목록 표시 ---
function renderSubjectPlans() {
    const box = document.getElementById('subjectPlanList');

    if (!box) return;

    if (subjectPlans.length === 0) {
        box.innerHTML = `
            <div class="empty-box">
                저장된 과목이 없습니다.<br>
                왼쪽에서 과목을 먼저 저장해주세요.
            </div>
        `;
        return;
    }

    let html = '';

    subjectPlans.forEach(plan => {
        const totalPlannedMinutes = plan.lectures.reduce((sum, lec) => sum + lec.duration, 0);
        const totalOriginalMinutes = plan.lectures.reduce((sum, lec) => {
            return sum + (lec.originalDuration || lec.duration);
        }, 0);

        html += `
            <div class="subject-plan-card">
                <div class="subject-plan-header">
                    <div>
                        <span class="subject-tag">${plan.subject}</span>
                        <b>${plan.start_lecture}강 ~ ${plan.end_lecture}강</b>
                    </div>
                    <div class="subject-plan-date">
                        ${plan.start_date} ~ ${plan.end_date}
                    </div>
                </div>

                <div class="subject-plan-meta">
                    총 ${plan.lectures.length}개 강의 · 원래 ${totalOriginalMinutes}분 → 스케줄 반영 ${totalPlannedMinutes}분
                </div>

                <div class="subject-plan-preview">
                    ${plan.lectures.slice(0, 8).map(lec => `
                        <span>${lec.lecture} ${(lec.originalDuration || lec.duration)}분 → ${lec.duration}분</span>
                    `).join('')}
                    ${plan.lectures.length > 8 ? `<span>+${plan.lectures.length - 8}개</span>` : ''}
                </div>

                <div class="subject-plan-actions">
                    <button onclick="editSubjectPlan(${plan.id})">수정</button>
                    <button class="danger" onclick="deleteSubjectPlan(${plan.id})">삭제</button>
                </div>
            </div>
        `;
    });

    box.innerHTML = html;
}

// --- 과목 수정 ---
function editSubjectPlan(id) {
    const plan = subjectPlans.find(item => item.id === id);

    if (!plan) return;

    document.getElementById('editingSubjectId').value = plan.id;
    document.getElementById('bulkSubject').value = plan.subject;
    document.getElementById('bulkStart').value = plan.start_lecture;
    document.getElementById('bulkEnd').value = plan.end_lecture;
    document.getElementById('bulkStartDate').value = plan.start_date;
    document.getElementById('bulkEndDate').value = plan.end_date;

    const firstLecture = plan.lectures[0];

    if (firstLecture && firstLecture.reductionRate && document.getElementById('timeReductionRate')) {
        document.getElementById('timeReductionRate').value = firstLecture.reductionRate;
    }

    expandSubjectInputs();

    plan.lectures.forEach(lec => {
        const input = document.getElementById(`dur_${lec.lectureNumber}`);

        if (input) {
            input.value = lec.originalDuration || lec.duration;
            updateSinglePlannedPreview(lec.lectureNumber);
        }
    });

    document.getElementById('btnSaveSubject').innerText = "수정한 과목 저장하기";
    document.getElementById('btnCancelEdit').style.display = 'block';

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// --- 과목 삭제 ---
async function deleteSubjectPlan(id) {
    const ok = confirm("이 과목만 삭제할까요? 기존 스케줄표는 삭제되지 않습니다.");

    if (!ok) return;

    try {
        const res = await fetch(`/api/subjects?id=${id}`, {
            method: 'DELETE'
        });

        const result = await res.json();

        if (!res.ok) {
            alert(`과목 삭제 실패: ${result.error || '알 수 없는 오류'}`);
            return;
        }

        await loadSubjectPlans();

    } catch (error) {
        console.error(error);
        alert("과목 삭제 중 오류가 발생했습니다.");
    }
}

// --- 입력 폼 초기화 ---
function resetSubjectForm() {
    const today = new Date().toISOString().split('T')[0];

    document.getElementById('editingSubjectId').value = '';
    document.getElementById('bulkSubject').value = '';
    document.getElementById('bulkStart').value = '';
    document.getElementById('bulkEnd').value = '';
    document.getElementById('bulkStartDate').value = today;
    document.getElementById('bulkEndDate').value = today;

    document.getElementById('bulkExpandedArea').innerHTML = '';
    document.getElementById('bulkExpandedArea').style.display = 'none';

    document.getElementById('btnSaveSubject').style.display = 'none';
    document.getElementById('btnSaveSubject').innerText = "이 과목 저장하기";
    document.getElementById('btnCancelEdit').style.display = 'none';
}

// --- 균등 분배 스케줄 생성 ---
function createBalancedSchedule(lectures, weekLimits) {
    const groupsMap = new Map();

    lectures.forEach((lec, index) => {
        const groupKey = `${lec.subject}__${lec.startDate}__${lec.endDate}`;

        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                key: groupKey,
                subject: lec.subject,
                startDate: lec.startDate,
                endDate: lec.endDate,
                order: index,
                pointer: 0,
                lectures: [],
                idealDates: []
            });
        }

        groupsMap.get(groupKey).lectures.push({
            ...lec,
            originalIndex: index
        });
    });

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
        if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
        return a.order - b.order;
    });

    if (groups.length === 0) {
        return {
            finalSchedule: [],
            unassigned: []
        };
    }

    const minStartDate = groups.reduce((min, group) => {
        return group.startDate < min ? group.startDate : min;
    }, groups[0].startDate);

    const maxEndDate = groups.reduce((max, group) => {
        return group.endDate > max ? group.endDate : max;
    }, groups[0].endDate);

    const dateKeys = getDateRange(minStartDate, maxEndDate);

    const remainingCapacity = {};
    const originalCapacity = {};

    dateKeys.forEach(dateKey => {
        const dayIndex = getDayIndex(dateKey);
        const capacity = weekLimits[dayIndex] || 0;

        remainingCapacity[dateKey] = capacity;
        originalCapacity[dateKey] = capacity;
    });

    function getStudyDatesForGroup(group) {
        return dateKeys.filter(dateKey => {
            return (
                dateKey >= group.startDate &&
                dateKey <= group.endDate &&
                originalCapacity[dateKey] > 0
            );
        });
    }

    function getDateDistance(a, b) {
        const dateA = parseLocalDate(a);
        const dateB = parseLocalDate(b);
        return Math.floor((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24));
    }

    function groupHasRemaining(group) {
        return group.pointer < group.lectures.length;
    }

    function getNextLecture(group) {
        return group.lectures[group.pointer];
    }

    function getRemainingDuration(group) {
        let total = 0;

        for (let i = group.pointer; i < group.lectures.length; i++) {
            total += group.lectures[i].duration;
        }

        return total;
    }

    function getRemainingCapacityForGroup(group, fromDateKey) {
        let total = 0;

        dateKeys.forEach(dateKey => {
            if (
                dateKey >= fromDateKey &&
                dateKey >= group.startDate &&
                dateKey <= group.endDate
            ) {
                total += remainingCapacity[dateKey] || 0;
            }
        });

        return total;
    }

    function getDaysLeft(group, currentDateKey) {
        const current = parseLocalDate(currentDateKey);
        const end = parseLocalDate(group.endDate);
        const diff = end.getTime() - current.getTime();

        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    groups.forEach(group => {
        const studyDates = getStudyDatesForGroup(group);

        if (studyDates.length === 0) {
            group.idealDates = group.lectures.map(() => group.endDate);
            return;
        }

        const totalDuration = group.lectures.reduce((sum, lec) => {
            return sum + lec.duration;
        }, 0);

        let accumulated = 0;

        group.lectures.forEach(lec => {
            const centerPoint = accumulated + lec.duration / 2;
            const ratio = totalDuration === 0 ? 0 : centerPoint / totalDuration;

            let idealIndex = Math.floor(ratio * studyDates.length);

            if (idealIndex < 0) idealIndex = 0;
            if (idealIndex >= studyDates.length) idealIndex = studyDates.length - 1;

            group.idealDates.push(studyDates[idealIndex]);
            accumulated += lec.duration;
        });
    });

    const finalSchedule = [];
    const assignedByDateSubject = {};

    dateKeys.forEach(dateKey => {
        assignedByDateSubject[dateKey] = {};
    });

    dateKeys.forEach(dateKey => {
        let safety = 0;

        while (remainingCapacity[dateKey] > 0 && safety < 1000) {
            safety++;

            const candidates = groups
                .filter(group => {
                    if (!groupHasRemaining(group)) return false;
                    if (dateKey < group.startDate) return false;
                    if (dateKey > group.endDate) return false;

                    const nextLecture = getNextLecture(group);
                    const idealDate = group.idealDates[group.pointer];

                    if (!idealDate) return false;
                    if (idealDate > dateKey) return false;
                    if (nextLecture.duration > remainingCapacity[dateKey]) return false;

                    return true;
                })
                .map(group => {
                    const nextLecture = getNextLecture(group);
                    const idealDate = group.idealDates[group.pointer];

                    const daysAfterIdeal = Math.max(0, getDateDistance(dateKey, idealDate));
                    const daysLeft = getDaysLeft(group, dateKey);
                    const remainingDuration = getRemainingDuration(group);
                    const remainingCapacityForGroup = getRemainingCapacityForGroup(group, dateKey);
                    const alreadySameSubjectToday = assignedByDateSubject[dateKey][group.subject] || 0;

                    let priority = 0;

                    priority += daysAfterIdeal * 120;
                    priority += 80 / (daysLeft + 1);
                    priority += remainingDuration / Math.max(remainingCapacityForGroup, 1) * 100;

                    if (dateKey === group.endDate) {
                        priority += 300;
                    }

                    priority -= alreadySameSubjectToday * 500;

                    if (daysLeft <= 1) {
                        priority += alreadySameSubjectToday * 250;
                    }

                    return {
                        group,
                        lecture: nextLecture,
                        priority
                    };
                })
                .sort((a, b) => {
                    if (b.priority !== a.priority) {
                        return b.priority - a.priority;
                    }

                    if (a.group.endDate !== b.group.endDate) {
                        return a.group.endDate.localeCompare(b.group.endDate);
                    }

                    return a.group.order - b.group.order;
                });

            if (candidates.length === 0) {
                break;
            }

            const chosen = candidates[0];
            const chosenGroup = chosen.group;
            const chosenLecture = chosen.lecture;

            finalSchedule.push({
                subject: chosenLecture.subject,
                lecture: chosenLecture.lecture,
                duration: chosenLecture.duration,
                assigned_date: `${dateKey} (${getDayName(dateKey)})`,
                is_done: chosenLecture.is_done === true
            });

            remainingCapacity[dateKey] -= chosenLecture.duration;
            chosenGroup.pointer++;

            assignedByDateSubject[dateKey][chosenGroup.subject] =
                (assignedByDateSubject[dateKey][chosenGroup.subject] || 0) + 1;
        }
    });

    const unassigned = [];

    groups.forEach(group => {
        while (groupHasRemaining(group)) {
            const lec = getNextLecture(group);

            unassigned.push({
                subject: lec.subject,
                lecture: lec.lecture,
                duration: lec.duration,
                assigned_date: `${lec.endDate} (${getDayName(lec.endDate)})`,
                is_done: lec.is_done === true
            });

            group.pointer++;
        }
    });

    return {
        finalSchedule,
        unassigned
    };
}

// --- 저장된 과목들로 스케줄 자동 생성 ---
async function generateAndSaveFromSubjects() {
    await loadSubjectPlans();

    if (subjectPlans.length === 0) {
        return alert("저장된 과목이 없습니다. 먼저 과목을 저장해주세요.");
    }

    const weekLimits = {};

    for (let i = 0; i < 7; i++) {
        weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    }

    const totalWeeklyTime = Object.values(weekLimits).reduce((a, b) => a + b, 0);

    if (totalWeeklyTime <= 0) {
        return alert("요일별 공부 가능 시간을 최소 하나 이상 입력해주세요.");
    }

    const lectures = [];

    subjectPlans.forEach(plan => {
        plan.lectures.forEach(lec => {
            lectures.push({
                subject: plan.subject,
                lecture: lec.lecture,
                duration: lec.duration,
                startDate: plan.start_date,
                endDate: plan.end_date,
                is_done: false
            });
        });
    });

    const result = createBalancedSchedule(lectures, weekLimits);
    let finalSchedule = result.finalSchedule;

    if (result.unassigned.length > 0) {
        finalSchedule = finalSchedule.concat(result.unassigned);

        alert(
            `입력한 기간과 요일별 가능 시간 안에 모두 배정하지 못한 강의가 ${result.unassigned.length}개 있습니다.\n` +
            `해당 강의는 각 과목의 종료일에 임시 배치했습니다.\n\n` +
            `요일별 가능 시간을 늘리거나 종료일을 뒤로 미뤄주세요.`
        );
    }

    finalSchedule.sort((a, b) => {
        if (a.assigned_date !== b.assigned_date) {
            return a.assigned_date.localeCompare(b.assigned_date);
        }

        if (a.subject !== b.subject) {
            return a.subject.localeCompare(b.subject);
        }

        return a.lecture.localeCompare(b.lecture, 'ko', {
            numeric: true
        });
    });

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedule: finalSchedule })
        });

        const resultText = await res.text();

        if (!res.ok) {
            alert(`저장 실패: 서버 응답 코드 ${res.status}\n${resultText}`);
            return;
        }

        alert("저장된 과목들을 기준으로 스케줄을 생성했습니다.");
        window.location.href = 'index.html';

    } catch (error) {
        console.error("저장 오류:", error);
        alert("스케줄 저장 중 오류가 발생했습니다.");
    }
}

// --- 완료 체크 ---
async function toggleTaskDone(id, checked) {
    try {
        const task = loadedScheduleData.find(item => Number(item.id) === Number(id));

        if (task) {
            task.is_done = checked;
        }

        renderCalendarSchedule();

        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id,
                is_done: checked
            })
        });

        const result = await res.json();

        if (!res.ok) {
            alert(`완료 상태 저장 실패: ${result.error || '알 수 없는 오류'}`);

            if (task) {
                task.is_done = !checked;
            }

            renderCalendarSchedule();
        }

    } catch (error) {
        console.error(error);
        alert("완료 상태 저장 중 오류가 발생했습니다.");
        await loadSchedule();
    }
}

// --- 이월 확인 ---
async function checkOverdueAndOfferReschedule() {
    const todayKey = getTodayKey();

    const overdueUndone = loadedScheduleData.filter(task => {
        const dateKey = extractDateOnly(task.assigned_date);
        return dateKey < todayKey && task.is_done !== true;
    });

    if (overdueUndone.length === 0) {
        return;
    }

    const notice = document.getElementById('rescheduleNotice');

    if (!notice) {
        return;
    }

    notice.style.display = 'block';
    notice.innerHTML = `
        <div>
            <b>미완료 강의 ${overdueUndone.length}개가 이전 날짜에 남아 있습니다.</b><br>
            완료한 강의는 그대로 두고, 미완료 강의와 오늘 이후 계획만 다시 분배할 수 있습니다.
        </div>
        <div class="reschedule-actions">
            <button onclick="rescheduleUndoneFromToday()">자동 재분배하기</button>
            <button class="muted" onclick="hideRescheduleNotice()">나중에 하기</button>
        </div>
    `;
}

function hideRescheduleNotice() {
    const notice = document.getElementById('rescheduleNotice');

    if (notice) {
        notice.style.display = 'none';
    }
}

// --- 미완료 + 미래 일정 자동 재분배 ---
async function rescheduleUndoneFromToday() {
    const todayKey = getTodayKey();

    await loadWeekSettingsFromDB();
    await loadSubjectPlans();

    if (subjectPlans.length === 0) {
        return alert("저장된 과목이 없어서 자동 재분배할 수 없습니다.");
    }

    const completedTasks = loadedScheduleData.filter(task => task.is_done === true);
    const completedKeys = new Set(
        completedTasks.map(task => makeLectureKey(task.subject, task.lecture))
    );

    const lecturesToReschedule = [];

    subjectPlans.forEach(plan => {
        plan.lectures.forEach(lec => {
            const key = makeLectureKey(plan.subject, lec.lecture);

            if (completedKeys.has(key)) {
                return;
            }

            const adjustedStartDate = todayKey > plan.start_date ? todayKey : plan.start_date;

            lecturesToReschedule.push({
                subject: plan.subject,
                lecture: lec.lecture,
                duration: lec.duration,
                startDate: adjustedStartDate,
                endDate: plan.end_date,
                is_done: false
            });
        });
    });

    if (lecturesToReschedule.length === 0) {
        return alert("재분배할 미완료 강의가 없습니다.");
    }

    const result = createBalancedSchedule(lecturesToReschedule, weekSettingsCache);
    let newPendingSchedule = result.finalSchedule;

    if (result.unassigned.length > 0) {
        newPendingSchedule = newPendingSchedule.concat(result.unassigned);

        alert(
            `오늘 이후 가능 시간 안에 모두 배정하지 못한 강의가 ${result.unassigned.length}개 있습니다.\n` +
            `해당 강의는 각 과목의 종료일에 임시 배치했습니다.`
        );
    }

    const preservedCompletedSchedule = completedTasks.map(task => ({
        subject: task.subject,
        lecture: task.lecture,
        duration: task.duration,
        assigned_date: task.assigned_date,
        is_done: true
    }));

    const finalSchedule = preservedCompletedSchedule.concat(newPendingSchedule);

    finalSchedule.sort((a, b) => {
        if (a.assigned_date !== b.assigned_date) {
            return a.assigned_date.localeCompare(b.assigned_date);
        }

        if (a.is_done !== b.is_done) {
            return a.is_done ? -1 : 1;
        }

        if (a.subject !== b.subject) {
            return a.subject.localeCompare(b.subject);
        }

        return a.lecture.localeCompare(b.lecture, 'ko', {
            numeric: true
        });
    });

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedule: finalSchedule })
        });

        const resultText = await res.text();

        if (!res.ok) {
            alert(`자동 재분배 실패: 서버 응답 코드 ${res.status}\n${resultText}`);
            return;
        }

        alert("미완료 강의와 오늘 이후 계획을 다시 분배했습니다.");
        hideRescheduleNotice();
        await loadSchedule();

    } catch (error) {
        console.error(error);
        alert("자동 재분배 중 오류가 발생했습니다.");
    }
}

// --- 달력 이동 ---
function moveCalendarMonth(delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    renderCalendarSchedule();
}

// --- 스케줄 불러오기 ---
async function loadSchedule() {
    try {
        const res = await fetch('/api/tasks');
        const data = await res.json();

        loadedScheduleData = data;

        renderCalendarSchedule();

    } catch (error) {
        console.error(error);

        const box = document.getElementById('scheduleResult');

        if (box) {
            box.innerHTML = "스케줄을 불러오는 중 오류가 발생했습니다.";
        }
    }
}

// --- 달력형 스케줄 렌더링 ---
function renderCalendarSchedule() {
    const box = document.getElementById('scheduleResult');
    const title = document.getElementById('calendarTitle');

    if (!box) return;

    if (!loadedScheduleData || loadedScheduleData.length === 0) {
        box.innerHTML = `
            <div class="empty-box">
                저장된 스케줄이 없습니다.<br>
                새 강의 입력에서 과목을 저장하고 스케줄을 생성해주세요.
            </div>
        `;
        return;
    }

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    if (title) {
        title.innerText = `📅 ${year}년 ${month + 1}월 학습 달력`;
    }

    const firstDay = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startDayIndex = firstDay.getDay();

    const scheduleByDate = {};

    loadedScheduleData.forEach(task => {
        const dateKey = extractDateOnly(task.assigned_date);

        if (!scheduleByDate[dateKey]) {
            scheduleByDate[dateKey] = [];
        }

        scheduleByDate[dateKey].push(task);
    });

    let html = `
        <div class="calendar-week-row calendar-week-head">
            <div>일</div>
            <div>월</div>
            <div>화</div>
            <div>수</div>
            <div>목</div>
            <div>금</div>
            <div>토</div>
        </div>

        <div class="calendar-grid">
    `;

    for (let i = 0; i < startDayIndex; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= lastDate; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const tasks = scheduleByDate[dateKey] || [];
        const totalMinutes = tasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const doneCount = tasks.filter(task => task.is_done === true).length;

        html += `
            <div class="calendar-day ${tasks.length > 0 ? 'has-task' : ''}">
                <div class="calendar-day-top">
                    <span class="calendar-date-num">${day}</span>
                    ${tasks.length > 0 ? `<span class="calendar-total">${doneCount}/${tasks.length} · ${totalMinutes}분</span>` : ''}
                </div>

                <div class="calendar-task-list">
                    ${tasks.map(task => `
                        <div class="calendar-task ${task.is_done ? 'done' : ''}">
                            <label class="calendar-task-check">
                                <input
                                    type="checkbox"
                                    ${task.is_done ? 'checked' : ''}
                                    onchange="toggleTaskDone(${task.id}, this.checked)"
                                >
                                <span>
                                    <span class="calendar-task-subject">${task.subject}</span>
                                    <span class="calendar-task-lecture">${task.lecture}</span>
                                    <span class="calendar-task-duration">${task.duration}분</span>
                                </span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    box.innerHTML = html;
}