let cart = [];

window.onload = () => {
    if (document.getElementById('startDate')) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
        
        // 이전에 세팅한 요일별 공부시간이 있다면 브라우저에 저장해두고 불러옵니다.
        loadWeekSettings();
    }
    if (document.getElementById('scheduleResult')) {
        loadSchedule();
    }
};

// 요일별 설정값 로컬 저장소 저장/불러오기
function saveWeekSettings() {
    for(let i=0; i<7; i++) {
        localStorage.setItem(`mpp_time_${i}`, document.getElementById(`time-${i}`).value);
    }
}
function loadWeekSettings() {
    for(let i=0; i<7; i++) {
        const saved = localStorage.getItem(`mpp_time_${i}`);
        if(saved) document.getElementById(`time-${i}`).value = saved;
    }
}

// 1. 강의 담기 (과목별 날짜 범위를 포함하여 저장)
function addLecture() {
    const subject = document.getElementById('subject').value;
    const lecture = document.getElementById('lecture').value;
    const duration = parseInt(document.getElementById('duration').value);
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if(!subject || !lecture || !duration || !startDate || !endDate) {
        return alert("모든 빈칸과 과목 기간을 입력해주세요!");
    }

    cart.push({ subject, lecture, duration, startDate, endDate });
    renderCart();
    saveWeekSettings(); // 담을 때 요일별 시간 세팅도 기억

    // 편의를 위해 강의명과 시간만 리셋 (과목명과 기간은 유지되므로 연속 입력 편리)
    document.getElementById('lecture').value = '';
    document.getElementById('duration').value = '';
}

function renderCart() {
    const box = document.getElementById('cartList');
    if(cart.length === 0) return box.innerHTML = "아직 담긴 강의가 없습니다.";

    let html = '';
    cart.forEach((lec) => {
        html += `<div class="item-row">
            <span><span class="subject-tag">${lec.subject}</span> ${lec.lecture}</span>
            <span>${lec.duration}분 (${lec.startDate}~${lec.endDate})</span>
        </div>`;
    });
    box.innerHTML = html;
}

// [★초강력 핵심 알고리즘★] 요일별 가용시간 + 과목별 기간 고려한 지능형 분배
async function generateAndSave() {
    if(cart.length === 0) return alert("먼저 강의를 목록에 담아주세요!");

    // 1. 요일별 제한 시간 불러오기 (0:일, 1:월, ... 6:토)
    const weekLimits = {};
    for(let i=0; i<7; i++) {
        weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    }

    // 2. 날짜별 총 잔여시간을 관리할 글로벌 캘린더 생성
    let globalCalendar = {}; 
    let finalSchedule = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    // 3. 담긴 강의들을 하나씩 최적의 날짜에 배치
    cart.forEach(lec => {
        let allocated = false;
        
        // 시차 오류를 방지하기 위해 날짜 문자열을 안전하게 파싱하여 Date 객체 생성
        const [sY, sM, sD] = lec.startDate.split('-').map(Number);
        const [eY, eM, eD] = lec.endDate.split('-').map(Number);
        
        let current = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);

        // 설정한 과목 시작일부터 마감일까지 하루씩 전진하며 들어갈 자리가 있는지 탐색
        while (current <= end) {
            // 날짜 키 생성 (예: 2026-06-19)
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;
            
            const dayOfWeek = current.getDay(); // 요일 숫자 (0~6)
            const totalLimitForDay = weekLimits[dayOfWeek]; // 해당 요일의 총 학습 가능시간

            // 만약 해당 날짜에 처음 일정을 배치하는 거라면 요일 한도만큼 초기화
            if (!globalCalendar[dateKey]) {
                globalCalendar[dateKey] = totalLimitForDay;
            }

            // 오늘 공부할 수 있는 남은 시간이 이 강의 시간보다 넉넉하다면? 배치 확정!
            if (globalCalendar[dateKey] >= lec.duration) {
                globalCalendar[dateKey] -= lec.duration; // 시간 차감
                
                const formattedDate = `${dateKey} (${dayNames[dayOfWeek]})`;
                finalSchedule.push({ ...lec, assigned_date: formattedDate });
                allocated = true;
                break; // 배치 성공했으므로 다음 강의로 넘어감
            }

            // 자리가 없으면 하루 뒤로 이동해서 다시 체크
            current.setDate(current.getDate() + 1);
        }

        // 만약 마감일까지 시간이 모자라 어디에도 배치되지 못했다면, 어쩔 수 없이 마감일에 강제 배정
        if (!allocated) {
            const formattedDate = `${lec.endDate} (${dayNames[end.getDay()]})`;
            finalSchedule.push({ ...lec, assigned_date: formattedDate });
        }
    });

    // 4. 생성된 똑똑한 스케줄을 데이터베이스로 전송
    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: finalSchedule })
    });

    if(res.ok) {
        alert("과목별 일치 날짜 및 요일별 시간 한도를 고려하여 최적의 계획이 수립되었습니다!");
        cart = [];
        window.location.href = 'index.html';
    }
}

// 4. 결과 불러오기 (index.html 전용)
async function loadSchedule() {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    
    const box = document.getElementById('scheduleResult');
    if(data.length === 0) return box.innerHTML = "저장된 스케줄이 없습니다. '새 강의 입력' 메뉴에서 일정을 생성해주세요.";

    let html = '';
    let currentDate = '';

    data.forEach(task => {
        if(task.assigned_date !== currentDate) {
            currentDate = task.assigned_date;
            html += `<div class="day-title" style="background: #212529;">📅 ${currentDate}</div>`;
        }
        html += `<div class="item-row" style="padding-left: 15px;">
            <span><span class="subject-tag">${task.subject}</span> <b>${task.lecture}</b></span>
            <span>⏱️ ${task.duration}분</span>
        </div>`;
    });
    box.innerHTML = html;
}