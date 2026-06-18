let subjectPlans = [];
let loadedScheduleData = [];
let calendarCurrentDate = new Date();

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
    }
};

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
            return;
        }

        const data = await res.json();

        data.forEach(item => {
            const input = document.getElementById(`time-${item.day_index}`);

            if (input) {
                input.value = item.minutes;
            }
        });

    } catch (error) {
        console.error("요일별 시간 불러오기 오류:", error);
    }
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
                        <span>
                            ${lec.lecture} 
                            ${(lec.originalDuration || lec.duration)}분 → ${lec.duration}분
                        </span>
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

    expandSubjectInputs();

    plan.lectures.forEach(lec => {
        const input = document.getElementById(`dur_${lec.lectureNumber}`);

        if (input) {
            input.value = lec.duration;
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

// --- 날짜 도우미 ---
function parseLocalDate(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
function getReductionRate() {
    const input = document.getElementById('timeReductionRate');

    if (!input) return 75;

    const rate = parseInt(input.value);

    if (isNaN(rate) || rate <= 0) {
        return 75;
    }

    return Math.min(Math.max(rate, 50), 100);
}

function calculatePlannedDuration(originalDuration) {
    const rate = getReductionRate();
    return Math.max(1, Math.ceil(originalDuration * rate / 100));
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
                lectures: []
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

    dateKeys.forEach(dateKey => {
        const dayIndex = getDayIndex(dateKey);
        remainingCapacity[dateKey] = weekLimits[dayIndex] || 0;
    });

    const finalSchedule = [];
    const recentSubjects = [];

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

    function getFutureCapacityForGroup(group, fromDateKey) {
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

    function calculatePriority(group, dateKey) {
        const remainingDuration = getRemainingDuration(group);
        const futureCapacity = getFutureCapacityForGroup(group, dateKey);
        const daysLeft = getDaysLeft(group, dateKey);

        let priority = 0;

        priority += remainingDuration / Math.max(futureCapacity, 1) * 100;
        priority += 30 / (daysLeft + 1);

        const sameSubjectCount = recentSubjects.filter(subject => subject === group.subject).length;
        priority -= sameSubjectCount * 18;

        if (dateKey === group.endDate) {
            priority += 80;
        }

        return priority;
    }

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

                    return nextLecture.duration <= remainingCapacity[dateKey];
                })
                .map(group => ({
                    group,
                    priority: calculatePriority(group, dateKey)
                }))
                .sort((a, b) => {
                    if (b.priority !== a.priority) return b.priority - a.priority;

                    if (a.group.endDate !== b.group.endDate) {
                        return a.group.endDate.localeCompare(b.group.endDate);
                    }

                    return a.group.order - b.group.order;
                });

            if (candidates.length === 0) {
                break;
            }

            const chosenGroup = candidates[0].group;
            const chosenLecture = getNextLecture(chosenGroup);

            finalSchedule.push({
                subject: chosenLecture.subject,
                lecture: chosenLecture.lecture,
                duration: chosenLecture.duration,
                assigned_date: `${dateKey} (${getDayName(dateKey)})`
            });

            remainingCapacity[dateKey] -= chosenLecture.duration;
            chosenGroup.pointer++;

            recentSubjects.push(chosenGroup.subject);

            if (recentSubjects.length > 4) {
                recentSubjects.shift();
            }
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
                assigned_date: `${lec.endDate} (${getDayName(lec.endDate)})`
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
                endDate: plan.end_date
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

        if (loadedScheduleData.length > 0) {
            const firstDate = extractDateOnly(loadedScheduleData[0].assigned_date);
            if (firstDate) {
                calendarCurrentDate = parseLocalDate(firstDate);
            }
        }

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

        html += `
            <div class="calendar-day ${tasks.length > 0 ? 'has-task' : ''}">
                <div class="calendar-day-top">
                    <span class="calendar-date-num">${day}</span>
                    ${tasks.length > 0 ? `<span class="calendar-total">${totalMinutes}분</span>` : ''}
                </div>

                <div class="calendar-task-list">
                    ${tasks.map(task => `
                        <div class="calendar-task">
                            <span class="calendar-task-subject">${task.subject}</span>
                            <span class="calendar-task-lecture">${task.lecture}</span>
                            <span class="calendar-task-duration">${task.duration}분</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    box.innerHTML = html;
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