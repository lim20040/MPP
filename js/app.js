let subjectPlans = [];
let loadedScheduleData = [];
let weekSettingsCache = {};

// 무조건 현재 날짜 기준으로 달력 초기화
let calendarCurrentDate = new Date();
let selectedDateKey = getTodayKey(); 

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

// --- 날짜 유틸 함수 ---
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

function getDayIndex(dateKey) { return parseLocalDate(dateKey).getDay(); }
function getDayName(dateKey) { const dayNames = ['일', '월', '화', '수', '목', '금', '토']; return dayNames[getDayIndex(dateKey)]; }
function extractDateOnly(assignedDate) { return String(assignedDate || '').slice(0, 10); }
function makeLectureKey(subject, lecture) { return `${subject}__${lecture}`; }

// --- DB 통신 (설정, 과목) ---
async function saveWeekSettingsToDB() { /* 생략 없이 기존 코드 동일하게 유지 */
    const weekSettings = {};
    for (let i = 0; i < 7; i++) {
        const input = document.getElementById(`time-${i}`);
        const value = parseInt(input.value) || 0;
        if (value < 0) return alert("요일별 가능 시간은 0분 이상이어야 합니다.");
        weekSettings[i] = value;
    }
    try {
        const res = await fetch('/api/week-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekSettings }) });
        if (!res.ok) return alert("저장 실패");
        weekSettingsCache = weekSettings;
        alert("저장되었습니다.");
    } catch (e) { alert("오류 발생"); }
}

async function loadWeekSettingsFromDB() {
    try {
        const res = await fetch('/api/week-settings');
        if (!res.ok) return {};
        const data = await res.json();
        const settings = {};
        data.forEach(item => {
            settings[item.day_index] = item.minutes;
            const input = document.getElementById(`time-${item.day_index}`);
            if (input) input.value = item.minutes;
        });
        weekSettingsCache = settings;
        return settings;
    } catch (e) { return {}; }
}

function getReductionRate() {
    const input = document.getElementById('timeReductionRate');
    if (!input) return 80;
    const rate = parseInt(input.value);
    if (isNaN(rate) || rate <= 0) return 80;
    return Math.min(Math.max(rate, 50), 100);
}

function calculatePlannedDuration(originalDuration) {
    const rate = getReductionRate();
    return Math.max(1, Math.ceil(originalDuration * rate / 100));
}

async function loadSubjectPlans() {
    try {
        const res = await fetch('/api/subjects');
        const data = await res.json();
        subjectPlans = data.map(plan => {
            let lectures = plan.lectures;
            if (typeof lectures === 'string') { try { lectures = JSON.parse(lectures); } catch { lectures = []; } }
            return { ...plan, lectures };
        });
        renderSubjectPlans();
    } catch (e) { }
}

function expandSubjectInputs() {
    const subject = document.getElementById('bulkSubject').value.trim();
    const start = parseInt(document.getElementById('bulkStart').value);
    const end = parseInt(document.getElementById('bulkEnd').value);
    const startDate = document.getElementById('bulkStartDate').value;
    const endDate = document.getElementById('bulkEndDate').value;

    if (!subject || isNaN(start) || isNaN(end) || !startDate || !endDate) return alert("모두 입력해주세요.");
    if (start > end) return alert("시작 강은 끝 강보다 클 수 없습니다.");

    const rate = getReductionRate();
    let html = `<div class="bulk-expanded-subject"><div class="duration-guide">자동으로 ${rate}% 반영됩니다.</div><div class="bulk-lecture-grid">`;

    for (let i = start; i <= end; i++) {
        html += `<div class="bulk-lecture-item duration-input-item"><span>${i}강</span><input type="number" id="dur_${i}" placeholder="원래 분" oninput="updateSinglePlannedPreview(${i})"><small id="planned_${i}">반영: -</small></div>`;
    }
    html += `</div></div>`;

    const area = document.getElementById('bulkExpandedArea');
    area.innerHTML = html;
    area.style.display = 'block';
    document.getElementById('btnSaveSubject').style.display = 'block';
}

function updateSinglePlannedPreview(lectureNumber) {
    const input = document.getElementById(`dur_${lectureNumber}`);
    const preview = document.getElementById(`planned_${lectureNumber}`);
    if (!input || !preview) return;
    const dur = parseInt(input.value);
    preview.innerText = isNaN(dur) || dur <= 0 ? "반영: -" : `반영: ${calculatePlannedDuration(dur)}분`;
}

function updatePlannedDurationPreview() {
    const start = parseInt(document.getElementById('bulkStart')?.value);
    const end = parseInt(document.getElementById('bulkEnd')?.value);
    if (isNaN(start) || isNaN(end)) return;
    for (let i = start; i <= end; i++) updateSinglePlannedPreview(i);
}

async function saveSubjectPlan() {
    const id = document.getElementById('editingSubjectId').value;
    const subject = document.getElementById('bulkSubject').value.trim();
    const startLec = parseInt(document.getElementById('bulkStart').value);
    const endLec = parseInt(document.getElementById('bulkEnd').value);
    const startD = document.getElementById('bulkStartDate').value;
    const endD = document.getElementById('bulkEndDate').value;
    const rate = getReductionRate();

    localStorage.setItem('mpp_time_reduction_rate', rate);
    if (!subject) return alert("과목명 필요");

    const lectures = [];
    for (let i = startLec; i <= endLec; i++) {
        const input = document.getElementById(`dur_${i}`);
        if (!input) return alert("펼쳐주세요.");
        const dur = parseInt(input.value);
        if (isNaN(dur) || dur <= 0) return alert("정확히 입력해주세요.");
        lectures.push({ lecture: `${i}강`, lectureNumber: i, originalDuration: dur, duration: calculatePlannedDuration(dur), reductionRate: rate });
    }

    try {
        const res = await fetch('/api/subjects', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id || null, subject, startLecture: startLec, endLecture: endLec, startDate: startD, endDate: endD, lectures })
        });
        if (!res.ok) throw new Error();
        alert("저장되었습니다.");
        resetSubjectForm();
        await loadSubjectPlans();
    } catch (e) { alert("저장 실패"); }
}

function renderSubjectPlans() { /* 생략 없이 기존 코드 동일 */
    const box = document.getElementById('subjectPlanList');
    if (!box) return;
    if (subjectPlans.length === 0) return box.innerHTML = `<div class="empty-box">저장된 과목 없음</div>`;
    let html = '';
    subjectPlans.forEach(plan => {
        html += `
            <div class="subject-plan-card">
                <div class="subject-plan-header">
                    <div><span class="subject-tag">${plan.subject}</span><b>${plan.start_lecture}강 ~ ${plan.end_lecture}강</b></div>
                    <div class="subject-plan-date">${plan.start_date} ~ ${plan.end_date}</div>
                </div>
                <div class="subject-plan-actions">
                    <button onclick="editSubjectPlan(${plan.id})">수정</button><button class="danger" onclick="deleteSubjectPlan(${plan.id})">삭제</button>
                </div>
            </div>`;
    });
    box.innerHTML = html;
}

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
        if (input) { input.value = lec.originalDuration || lec.duration; updateSinglePlannedPreview(lec.lectureNumber); }
    });
    document.getElementById('btnSaveSubject').innerText = "수정한 과목 저장하기";
    document.getElementById('btnCancelEdit').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteSubjectPlan(id) {
    if (!confirm("삭제할까요?")) return;
    await fetch(`/api/subjects?id=${id}`, { method: 'DELETE' });
    await loadSubjectPlans();
}

function resetSubjectForm() {
    document.getElementById('editingSubjectId').value = '';
    document.getElementById('bulkSubject').value = '';
    document.getElementById('bulkExpandedArea').innerHTML = '';
    document.getElementById('bulkExpandedArea').style.display = 'none';
    document.getElementById('btnSaveSubject').style.display = 'none';
    document.getElementById('btnCancelEdit').style.display = 'none';
}

// --- 일정 생성 로직 ---
function createBalancedSchedule(lectures, weekLimits) { /* 동일한 균등 분배 알고리즘 적용 (변경없음) */
    const groupsMap = new Map();
    lectures.forEach((lec, index) => {
        const groupKey = `${lec.subject}__${lec.startDate}__${lec.endDate}`;
        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, { key: groupKey, subject: lec.subject, startDate: lec.startDate, endDate: lec.endDate, order: index, pointer: 0, lectures: [], idealDates: [] });
        }
        groupsMap.get(groupKey).lectures.push({ ...lec, originalIndex: index });
    });
    const groups = Array.from(groupsMap.values()).sort((a, b) => { if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate); return a.order - b.order; });
    if (groups.length === 0) return { finalSchedule: [], unassigned: [] };
    const minStartDate = groups.reduce((min, group) => group.startDate < min ? group.startDate : min, groups[0].startDate);
    const maxEndDate = groups.reduce((max, group) => group.endDate > max ? group.endDate : max, groups[0].endDate);
    const dateKeys = getDateRange(minStartDate, maxEndDate);
    const remainingCapacity = {};
    const originalCapacity = {};
    dateKeys.forEach(dateKey => {
        const capacity = weekLimits[getDayIndex(dateKey)] || 0;
        remainingCapacity[dateKey] = capacity; originalCapacity[dateKey] = capacity;
    });

    groups.forEach(group => {
        const studyDates = dateKeys.filter(dk => dk >= group.startDate && dk <= group.endDate && originalCapacity[dk] > 0);
        if (studyDates.length === 0) { group.idealDates = group.lectures.map(() => group.endDate); return; }
        const totalDuration = group.lectures.reduce((sum, lec) => sum + lec.duration, 0);
        let accumulated = 0;
        group.lectures.forEach(lec => {
            let idealIndex = Math.floor((accumulated + lec.duration / 2) / totalDuration * studyDates.length);
            if (idealIndex < 0) idealIndex = 0; if (idealIndex >= studyDates.length) idealIndex = studyDates.length - 1;
            group.idealDates.push(studyDates[idealIndex]);
            accumulated += lec.duration;
        });
    });

    const finalSchedule = [];
    const assignedByDateSubject = {};
    dateKeys.forEach(dateKey => assignedByDateSubject[dateKey] = {});

    dateKeys.forEach(dateKey => {
        let safety = 0;
        while (remainingCapacity[dateKey] > 0 && safety < 1000) {
            safety++;
            const candidates = groups.filter(g => g.pointer < g.lectures.length && dateKey >= g.startDate && dateKey <= g.endDate && g.idealDates[g.pointer] <= dateKey && g.lectures[g.pointer].duration <= remainingCapacity[dateKey])
                .map(g => {
                    const daysLeft = Math.max(0, Math.floor((parseLocalDate(g.endDate).getTime() - parseLocalDate(dateKey).getTime()) / 86400000));
                    let priority = Math.max(0, Math.floor((parseLocalDate(dateKey).getTime() - parseLocalDate(g.idealDates[g.pointer]).getTime()) / 86400000)) * 120 + 80 / (daysLeft + 1);
                    if (dateKey === g.endDate) priority += 300;
                    priority -= (assignedByDateSubject[dateKey][g.subject] || 0) * 500;
                    return { group: g, lecture: g.lectures[g.pointer], priority };
                }).sort((a, b) => b.priority - a.priority || a.group.endDate.localeCompare(b.group.endDate));

            if (candidates.length === 0) break;
            const chosen = candidates[0];
            finalSchedule.push({ subject: chosen.lecture.subject, lecture: chosen.lecture.lecture, duration: chosen.lecture.duration, assigned_date: `${dateKey} (${getDayName(dateKey)})`, is_done: chosen.lecture.is_done === true });
            remainingCapacity[dateKey] -= chosen.lecture.duration;
            chosen.group.pointer++;
            assignedByDateSubject[dateKey][chosen.group.subject] = (assignedByDateSubject[dateKey][chosen.group.subject] || 0) + 1;
        }
    });

    const unassigned = [];
    groups.forEach(group => {
        while (group.pointer < group.lectures.length) {
            const lec = group.lectures[group.pointer++];
            unassigned.push({ subject: lec.subject, lecture: lec.lecture, duration: lec.duration, assigned_date: `${lec.endDate} (${getDayName(lec.endDate)})`, is_done: lec.is_done === true });
        }
    });
    return { finalSchedule, unassigned };
}

async function generateAndSaveFromSubjects() {
    await loadSubjectPlans();
    if (subjectPlans.length === 0) return alert("저장된 과목이 없습니다.");
    const weekLimits = {};
    for (let i = 0; i < 7; i++) weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    
    const lectures = [];
    subjectPlans.forEach(plan => plan.lectures.forEach(lec => lectures.push({ subject: plan.subject, lecture: lec.lecture, duration: lec.duration, startDate: plan.start_date, endDate: plan.end_date, is_done: false })));
    const result = createBalancedSchedule(lectures, weekLimits);
    let finalSchedule = result.finalSchedule.concat(result.unassigned);

    try {
        await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule: finalSchedule }) });
        alert("스케줄 생성 완료");
        window.location.href = 'index.html';
    } catch (e) { alert("저장 실패"); }
}

// --- 일정 관리 ---
async function forceReschedule() {
    if (!confirm("미완료 일정을 '오늘' 기준으로 재분배하시겠습니까?")) return;
    await rescheduleUndoneFromToday(true);
}

// 완료 체크 시 미래 일정을 오늘로 당겨오는 로직 포함
async function toggleTaskDone(id, checked) {
    try {
        const task = loadedScheduleData.find(item => Number(item.id) === Number(id));
        const todayKey = getTodayKey();
        const todayString = `${todayKey} (${getDayName(todayKey)})`;
        let targetDate = task.assigned_date;

        if (task) {
            task.is_done = checked;
            if (checked) {
                task.assigned_date = todayString;
                targetDate = todayString;
            }
        }

        renderCalendarSchedule(); // 달력 정보 업데이트
        renderSelectedDateTasks(); // 리스트 정보 업데이트

        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_done: checked, assigned_date: targetDate })
        });
    } catch (error) {
        alert("저장 오류");
        await loadSchedule();
    }
}

async function checkOverdueAndOfferReschedule() {
    const todayKey = getTodayKey();
    const overdueUndone = loadedScheduleData.filter(task => extractDateOnly(task.assigned_date) < todayKey && task.is_done !== true);
    if (overdueUndone.length === 0) return;
    
    const notice = document.getElementById('rescheduleNotice');
    if (!notice) return;
    notice.style.display = 'block';
    notice.innerHTML = `<div><b>미완료 강의 ${overdueUndone.length}개가 이전 날짜에 있습니다.</b></div>
        <div class="reschedule-actions"><button onclick="rescheduleUndoneFromToday(false)">자동 재분배</button><button class="muted" onclick="hideRescheduleNotice()">나중에</button></div>`;
}

function hideRescheduleNotice() { document.getElementById('rescheduleNotice').style.display = 'none'; }

async function rescheduleUndoneFromToday(isManual = false) {
    const todayKey = getTodayKey();
    await loadWeekSettingsFromDB();
    await loadSubjectPlans();

    const completedTasks = loadedScheduleData.filter(t => t.is_done === true);
    const completedKeys = new Set(completedTasks.map(t => makeLectureKey(t.subject, t.lecture)));
    const lecturesToReschedule = [];

    subjectPlans.forEach(plan => {
        plan.lectures.forEach(lec => {
            if (completedKeys.has(makeLectureKey(plan.subject, lec.lecture))) return;
            const adjustedStartDate = todayKey > plan.start_date ? todayKey : plan.start_date;
            lecturesToReschedule.push({ subject: plan.subject, lecture: lec.lecture, duration: lec.duration, startDate: adjustedStartDate, endDate: plan.end_date, is_done: false });
        });
    });

    const result = createBalancedSchedule(lecturesToReschedule, weekSettingsCache);
    let finalSchedule = completedTasks.map(t => ({ subject: t.subject, lecture: t.lecture, duration: t.duration, assigned_date: t.assigned_date, is_done: true }))
        .concat(result.finalSchedule).concat(result.unassigned);

    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule: finalSchedule }) });
    alert("재분배 완료");
    window.location.reload();
}

// === 새로 적용된 "클릭 가능한 달력 뷰" 로직 ===

function moveCalendarMonth(delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    renderCalendarSchedule();
}

// 날짜 클릭 시 이벤트
function selectDate(dateKey) {
    selectedDateKey = dateKey;
    renderCalendarSchedule(); // 달력에서 selected 하이라이트 업데이트
    renderSelectedDateTasks(); // 우측 패널에 상세 리스트 출력
}

async function loadSchedule() {
    try {
        const res = await fetch('/api/tasks');
        loadedScheduleData = await res.json();
        
        // 데이터 로드 완료 후 항상 현재 월 달력과 오늘 날짜 상세표시 렌더링
        renderCalendarSchedule();
        renderSelectedDateTasks();
    } catch (error) {
        console.error(error);
    }
}

// 달력 그리기 (요약만 표시)
function renderCalendarSchedule() {
    const box = document.getElementById('scheduleResult');
    const title = document.getElementById('calendarTitle');
    if (!box) return;

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();
    if (title) title.innerText = `📅 ${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startDayIndex = firstDay.getDay();

    const scheduleByDate = {};
    loadedScheduleData.forEach(task => {
        const dateKey = extractDateOnly(task.assigned_date);
        if (!scheduleByDate[dateKey]) scheduleByDate[dateKey] = [];
        scheduleByDate[dateKey].push(task);
    });

    let html = `
        <div class="calendar-week-row calendar-week-head">
            <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
        </div>
        <div class="calendar-grid">
    `;

    for (let i = 0; i < startDayIndex; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    const todayKey = getTodayKey();

    for (let day = 1; day <= lastDate; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const tasks = scheduleByDate[dateKey] || [];
        const doneCount = tasks.filter(t => t.is_done).length;
        
        const isSelected = dateKey === selectedDateKey;
        const isToday = dateKey === todayKey;
        const isAllDone = tasks.length > 0 && tasks.length === doneCount;

        html += `
            <div class="calendar-day ${tasks.length > 0 ? 'has-task' : ''} ${isSelected ? 'selected' : ''}" 
                 onclick="selectDate('${dateKey}')">
                
                <span class="calendar-date-num ${isToday ? 'today' : ''}">${day}</span>
                
                ${tasks.length > 0 ? `
                    <div class="calendar-task-summary ${isAllDone ? 'all-done' : ''}">
                        ${doneCount}/${tasks.length}
                    </div>
                ` : ''}
            </div>
        `;
    }

    html += `</div>`;
    box.innerHTML = html;
}

// 오른쪽 상세 리스트 그리기
function renderSelectedDateTasks() {
    const box = document.getElementById('dailyTaskList');
    const title = document.getElementById('dailyTitle');
    if (!box) return;

    const [y, m, d] = selectedDateKey.split('-');
    const isToday = selectedDateKey === getTodayKey();
    title.innerHTML = `📋 ${parseInt(m)}월 ${parseInt(d)}일 ${isToday ? '<span style="font-size: 0.9rem; background: var(--primary); color: white; padding: 2px 8px; border-radius: 999px; vertical-align: middle;">오늘</span>' : ''}`;

    const tasks = loadedScheduleData.filter(t => extractDateOnly(t.assigned_date) === selectedDateKey);

    if (tasks.length === 0) {
        box.innerHTML = `
            <div class="empty-box" style="padding: 3rem 1rem;">
                이 날은 배정된 일정이 없습니다.
            </div>
        `;
        return;
    }

    let html = '';
    tasks.forEach(task => {
        html += `
            <div class="task-item ${task.is_done ? 'done' : ''}">
                <input 
                    type="checkbox" 
                    class="task-checkbox"
                    ${task.is_done ? 'checked' : ''} 
                    onchange="toggleTaskDone(${task.id}, this.checked)"
                >
                <div class="task-info">
                    <span class="task-subject">${task.subject}</span>
                    <span class="task-lecture">${task.lecture}</span>
                    <span class="task-duration">${task.duration}분 예상</span>
                </div>
            </div>
        `;
    });

    box.innerHTML = html;
}