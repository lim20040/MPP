let cart = [];
let bulkLectureData = [];

// 페이지 로딩 시 작동
window.onload = async () => {
    const today = new Date().toISOString().split('T')[0];

    if (document.getElementById('startDate')) {
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;

        await loadWeekSettingsFromDB();

        document.querySelectorAll('.bulk-start-date, .bulk-end-date').forEach(input => {
            input.value = today;
        });
    }

    if (document.getElementById('scheduleResult')) {
        loadSchedule();
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

        const text = await res.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            alert(`요일별 시간 저장 실패\n서버가 JSON이 아닌 응답을 보냈습니다.\n\n상태코드: ${res.status}\n응답: ${text.slice(0, 200)}`);
            return;
        }

        if (!res.ok) {
            alert(`요일별 시간 저장 실패\n상태코드: ${res.status}\n오류: ${result.error || '알 수 없는 오류'}`);
            return;
        }

        alert("요일별 가능 시간이 저장되었습니다.");

    } catch (error) {
        console.error(error);
        alert(`요일별 가능 시간 저장 중 오류가 발생했습니다.\n${error.message}`);
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

// --- 1. 단건 추가 ---
function addLecture() {
    const subject = document.getElementById('subject').value.trim();
    const lecture = document.getElementById('lecture').value.trim();
    const duration = parseInt(document.getElementById('duration').value);
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!subject || !lecture || !duration || !startDate || !endDate) {
        return alert("모든 빈칸과 과목 기간을 입력해주세요!");
    }

    if (duration <= 0) {
        return alert("강의 시간은 1분 이상이어야 합니다.");
    }

    if (startDate > endDate) {
        return alert("시작일은 종료일보다 늦을 수 없습니다.");
    }

    cart.push({
        subject,
        lecture,
        duration,
        startDate,
        endDate
    });

    renderCart();

    document.getElementById('lecture').value = '';
    document.getElementById('duration').value = '';
}

// --- 2. 과목별 행 추가 ---
function addSubjectBulkRow() {
    const list = document.getElementById('subjectBulkList');
    const today = new Date().toISOString().split('T')[0];

    const row = document.createElement('div');
    row.className = 'subject-bulk-row';

    row.innerHTML = `
        <div class="bulk-field bulk-subject-field">
            <label>과목명</label>
            <input type="text" class="bulk-subject" placeholder="예: 선형대수">
        </div>

        <div class="bulk-field">
            <label>시작 강</label>
            <input type="number" class="bulk-start" placeholder="예: 1">
        </div>

        <div class="bulk-field">
            <label>끝 강</label>
            <input type="number" class="bulk-end" placeholder="예: 20">
        </div>

        <div class="bulk-field">
            <label>시작일</label>
            <input type="date" class="bulk-start-date" value="${today}">
        </div>

        <div class="bulk-field">
            <label>종료일</label>
            <input type="date" class="bulk-end-date" value="${today}">
        </div>

        <button class="btn-small btn-remove" onclick="removeSubjectBulkRow(this)">삭제</button>
    `;

    list.appendChild(row);
}

// --- 3. 과목별 행 삭제 ---
function removeSubjectBulkRow(button) {
    const rows = document.querySelectorAll('.subject-bulk-row');

    if (rows.length <= 1) {
        alert("최소 한 과목은 있어야 합니다.");
        return;
    }

    button.closest('.subject-bulk-row').remove();
}

// --- 4. 과목별 시작 강 ~ 끝 강 기준으로 시간 입력칸 펼치기 ---
function expandSubjectBulkInputs() {
    const rows = document.querySelectorAll('.subject-bulk-row');
    const area = document.getElementById('bulkExpandedArea');
    const btn = document.getElementById('btnConfirmBulk');

    bulkLectureData = [];
    let html = '';
    let hasError = false;

    rows.forEach((row, rowIndex) => {
        if (hasError) return;

        const subject = row.querySelector('.bulk-subject').value.trim();
        const start = parseInt(row.querySelector('.bulk-start').value);
        const end = parseInt(row.querySelector('.bulk-end').value);
        const startDate = row.querySelector('.bulk-start-date').value;
        const endDate = row.querySelector('.bulk-end-date').value;

        if (!subject || isNaN(start) || isNaN(end) || !startDate || !endDate) {
            alert(`${rowIndex + 1}번째 과목의 과목명, 시작 강, 끝 강, 시작일, 종료일을 모두 입력해주세요.`);
            hasError = true;
            return;
        }

        if (start <= 0 || end <= 0) {
            alert(`${subject}의 시작 강과 끝 강은 1 이상이어야 합니다.`);
            hasError = true;
            return;
        }

        if (start > end) {
            alert(`${subject}의 시작 강은 끝 강보다 클 수 없습니다.`);
            hasError = true;
            return;
        }

        if (startDate > endDate) {
            alert(`${subject}의 시작일은 종료일보다 늦을 수 없습니다.`);
            hasError = true;
            return;
        }

        bulkLectureData.push({
            rowIndex,
            subject,
            start,
            end,
            startDate,
            endDate
        });

        html += `
            <div style="margin-bottom: 18px;">
                <div style="font-weight: 800; color: #4F46E5; margin-bottom: 8px;">
                    ${subject} ｜ ${start}강 ~ ${end}강 ｜ ${startDate} ~ ${endDate}
                </div>

                <div class="bulk-lecture-grid">
        `;

        for (let i = start; i <= end; i++) {
            html += `
                <div class="bulk-lecture-item">
                    <span>${i}강</span>
                    <input type="number" id="dur_${rowIndex}_${i}" placeholder="분">
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    });

    if (hasError) return;

    if (bulkLectureData.length === 0) {
        return alert("과목명, 시작 강, 끝 강, 시작일, 종료일을 올바르게 입력해주세요.");
    }

    area.innerHTML = html;
    area.style.display = 'block';
    btn.style.display = 'block';
}

// --- 5. 펼쳐진 과목별 강의들을 장바구니에 담기 ---
function addExpandedLectures() {
    if (bulkLectureData.length === 0) {
        return alert("먼저 시간 입력란을 펼쳐주세요.");
    }

    for (const data of bulkLectureData) {
        for (let i = data.start; i <= data.end; i++) {
            const durationInput = document.getElementById(`dur_${data.rowIndex}_${i}`);
            const duration = parseInt(durationInput.value);

            if (isNaN(duration) || duration <= 0) {
                return alert(`${data.subject} ${i}강의 시간을 정확히 입력해주세요.`);
            }

            cart.push({
                subject: data.subject,
                lecture: i + '강',
                duration: duration,
                startDate: data.startDate,
                endDate: data.endDate
            });
        }
    }

    renderCart();

    document.getElementById('bulkExpandedArea').style.display = 'none';
    document.getElementById('btnConfirmBulk').style.display = 'none';
    document.getElementById('bulkExpandedArea').innerHTML = '';

    bulkLectureData = [];

    alert("과목별 강의가 장바구니에 담겼습니다.");
}

// --- 6. 장바구니 화면에 그리기 ---
function renderCart() {
    const box = document.getElementById('cartList');

    if (!box) return;

    if (cart.length === 0) {
        box.innerHTML = "목록이 비어있습니다.";
        return;
    }

    let html = '';

    cart.forEach((lec, index) => {
        html += `
            <div class="item-row">
                <div style="flex: 1; text-align: left;">
                    <div style="margin-bottom: 4px;">
                        <span class="subject-tag">${lec.subject}</span>
                        <b>${lec.lecture}</b>
                    </div>
                    <div style="font-size: 0.75rem; color: #888;">
                        🗓️ ${lec.startDate} ~ ${lec.endDate}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                    <input
                        type="number"
                        value="${lec.duration}"
                        onchange="updateCartItem(${index}, this.value)"
                        style="width: 65px; padding: 6px; text-align: center; background: white; margin: 0; border: 1px solid #ccc;"
                    >
                    <span>분</span>
                    <button
                        onclick="removeCartItem(${index})"
                        style="width: auto; padding: 6px 10px; background: #EF4444; color: white; margin: 0; font-size: 0.8rem;"
                    >
                        ✖
                    </button>
                </div>
            </div>
        `;
    });

    box.innerHTML = html;
}

function updateCartItem(index, newVal) {
    const duration = parseInt(newVal);

    if (isNaN(duration) || duration <= 0) {
        alert("강의 시간은 1분 이상이어야 합니다.");
        renderCart();
        return;
    }

    cart[index].duration = duration;
}

function removeCartItem(index) {
    cart.splice(index, 1);
    renderCart();
}

// --- 날짜 관련 도우미 함수 ---
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

// --- 핵심: 과목별 균등 분배 스케줄 생성 ---
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
            subject: lec.subject,
            lecture: lec.lecture,
            duration: lec.duration,
            startDate: lec.startDate,
            endDate: lec.endDate,
            originalIndex: index
        });
    });

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
        if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
        return a.order - b.order;
    });

    if (groups.length === 0) {
        return [];
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
            if (dateKey >= fromDateKey && dateKey >= group.startDate && dateKey <= group.endDate) {
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

        // 마감일까지 남은 시간 대비 해야 할 분량이 많을수록 우선
        priority += remainingDuration / Math.max(futureCapacity, 1) * 100;

        // 마감일이 가까울수록 우선
        priority += 30 / (daysLeft + 1);

        // 같은 과목이 너무 연속으로 나오면 우선순위 감소
        const sameSubjectCount = recentSubjects.filter(subject => subject === group.subject).length;
        priority -= sameSubjectCount * 18;

        // 이미 마감일 당일이면 강하게 우선
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
                .map(group => {
                    return {
                        group,
                        priority: calculatePriority(group, dateKey)
                    };
                })
                .sort((a, b) => {
                    if (b.priority !== a.priority) return b.priority - a.priority;
                    if (a.group.endDate !== b.group.endDate) return a.group.endDate.localeCompare(b.group.endDate);
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

// --- 7. 균등 분배 스케줄 자동 생성 및 저장 ---
async function generateAndSave() {
    if (cart.length === 0) {
        return alert("장바구니가 비어있습니다. 먼저 강의를 장바구니에 담아주세요.");
    }

    const weekLimits = {};

    for (let i = 0; i < 7; i++) {
        weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    }

    const totalWeeklyTime = Object.values(weekLimits).reduce((a, b) => a + b, 0);

    if (totalWeeklyTime <= 0) {
        return alert("요일별 공부 가능 시간을 최소 하나 이상 입력해주세요.");
    }

    const result = createBalancedSchedule(cart, weekLimits);

    let finalSchedule = result.finalSchedule;

    if (result.unassigned.length > 0) {
        finalSchedule = finalSchedule.concat(result.unassigned);

        alert(
            `입력한 기간과 요일별 가능 시간 안에 모두 배정하지 못한 강의가 ${result.unassigned.length}개 있습니다.\n` +
            `해당 강의는 각 과목의 종료일에 임시 배치했습니다.\n\n` +
            `해결하려면 요일별 가능 시간을 늘리거나 종료일을 뒤로 미뤄주세요.`
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

        alert("과목별 마감일과 하루 가능 시간을 고려해서 균등 분배 스케줄을 저장했습니다.");
        cart = [];
        window.location.href = 'index.html';

    } catch (error) {
        console.error("저장 오류:", error);
        alert("스케줄 저장 중 오류가 발생했습니다.");
    }
}

// --- 8. 스케줄 불러오기 ---
async function loadSchedule() {
    try {
        const res = await fetch('/api/tasks');
        const data = await res.json();

        const box = document.getElementById('scheduleResult');

        if (!box) return;

        if (data.length === 0) {
            box.innerHTML = "저장된 스케줄이 없습니다. '새 강의 입력' 메뉴에서 일정을 생성해주세요.";
            return;
        }

        let html = '';
        let currentDate = '';

        data.forEach(task => {
            if (task.assigned_date !== currentDate) {
                currentDate = task.assigned_date;
                html += `<div class="day-title">📅 ${currentDate}</div>`;
            }

            html += `
                <div class="item-row" style="padding-left: 15px;">
                    <span>
                        <span class="subject-tag">${task.subject}</span>
                        <b>${task.lecture}</b>
                    </span>
                    <span>⏱️ ${task.duration}분</span>
                </div>
            `;
        });

        box.innerHTML = html;

    } catch (error) {
        console.error(error);

        const box = document.getElementById('scheduleResult');

        if (box) {
            box.innerHTML = "스케줄을 불러오는 중 오류가 발생했습니다.";
        }
    }
}