let cart = [];
let bulkLectureData = [];

// 페이지 로딩 시 작동
window.onload = () => {
    const today = new Date().toISOString().split('T')[0];

    if (document.getElementById('startDate')) {
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;

        loadWeekSettings();

        document.querySelectorAll('.bulk-start-date, .bulk-end-date').forEach(input => {
            input.value = today;
        });
    }

    if (document.getElementById('scheduleResult')) {
        loadSchedule();
    }
};

// --- 요일별 설정 로컬 저장/불러오기 ---
function saveWeekSettings() {
    for (let i = 0; i < 7; i++) {
        const input = document.getElementById(`time-${i}`);

        if (input) {
            localStorage.setItem(`mpp_time_${i}`, input.value);
        }
    }
}

function loadWeekSettings() {
    for (let i = 0; i < 7; i++) {
        const input = document.getElementById(`time-${i}`);
        const saved = localStorage.getItem(`mpp_time_${i}`);

        if (input && saved) {
            input.value = saved;
        }
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
    saveWeekSettings();

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

    rows.forEach((row, rowIndex) => {
        const subject = row.querySelector('.bulk-subject').value.trim();
        const start = parseInt(row.querySelector('.bulk-start').value);
        const end = parseInt(row.querySelector('.bulk-end').value);
        const startDate = row.querySelector('.bulk-start-date').value;
        const endDate = row.querySelector('.bulk-end-date').value;

        if (!subject && isNaN(start) && isNaN(end) && !startDate && !endDate) {
            return;
        }

        if (!subject || isNaN(start) || isNaN(end) || !startDate || !endDate) {
            alert(`${rowIndex + 1}번째 과목의 과목명, 시작 강, 끝 강, 시작일, 종료일을 모두 입력해주세요.`);
            return;
        }

        if (start <= 0 || end <= 0) {
            alert(`${subject}의 시작 강과 끝 강은 1 이상이어야 합니다.`);
            return;
        }

        if (start > end) {
            alert(`${subject}의 시작 강은 끝 강보다 클 수 없습니다.`);
            return;
        }

        if (startDate > endDate) {
            alert(`${subject}의 시작일은 종료일보다 늦을 수 없습니다.`);
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
    saveWeekSettings();

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

// --- 7. 지능형 스케줄 자동 생성 및 저장 ---
async function generateAndSave() {
    if (cart.length === 0) {
        return alert("먼저 강의를 목록에 담아주세요!");
    }

    const weekLimits = {};

    for (let i = 0; i < 7; i++) {
        weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    }

    const totalWeeklyTime = Object.values(weekLimits).reduce((a, b) => a + b, 0);

    if (totalWeeklyTime <= 0) {
        return alert("요일별 공부 가능 시간을 최소 하나 이상 입력해주세요.");
    }

    let globalCalendar = {};
    let finalSchedule = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    cart.forEach(lec => {
        let allocated = false;

        const [sY, sM, sD] = lec.startDate.split('-').map(Number);
        const [eY, eM, eD] = lec.endDate.split('-').map(Number);

        let current = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);

        while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;

            const dayOfWeek = current.getDay();
            const totalLimitForDay = weekLimits[dayOfWeek];

            if (!globalCalendar[dateKey]) {
                globalCalendar[dateKey] = totalLimitForDay;
            }

            if (globalCalendar[dateKey] >= lec.duration) {
                globalCalendar[dateKey] -= lec.duration;

                const formattedDate = `${dateKey} (${dayNames[dayOfWeek]})`;

                finalSchedule.push({
                    subject: lec.subject,
                    lecture: lec.lecture,
                    duration: lec.duration,
                    assigned_date: formattedDate
                });

                allocated = true;
                break;
            }

            current.setDate(current.getDate() + 1);
        }

        if (!allocated) {
            const formattedDate = `${lec.endDate} (${dayNames[end.getDay()]})`;

            finalSchedule.push({
                subject: lec.subject,
                lecture: lec.lecture,
                duration: lec.duration,
                assigned_date: formattedDate
            });
        }
    });

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedule: finalSchedule })
        });

        if (res.ok) {
            alert("과목별 기간 및 요일별 시간을 고려하여 계획이 수립되었습니다!");
            cart = [];
            window.location.href = 'index.html';
        } else {
            alert("저장 중 오류가 발생했습니다.");
        }
    } catch (error) {
        console.error(error);
        alert("서버와 연결하는 중 오류가 발생했습니다.");
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
        document.getElementById('scheduleResult').innerHTML = "스케줄을 불러오는 중 오류가 발생했습니다.";
    }
}